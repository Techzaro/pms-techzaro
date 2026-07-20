<?php
/**
 * SAFE Migration Runner - Backs up DB first, then runs only safe migrations.
 * Upload to pmsv2.api.techxaro.com/public/, run once, DELETE.
 */

$basePath = dirname(__DIR__);
$envPath = $basePath . '/.env';
if (!file_exists($envPath)) {
    $envPath = $basePath . '/.env.production';
}
$env = [];
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if (!$line || $line[0] === '#') continue;
        if (strpos($line, '=') !== false) {
            [$key, $val] = explode('=', $line, 2);
            $env[trim($key)] = trim($val);
        }
    }
}

$dbHost = $env['DB_HOST'] ?? 'localhost';
$dbName = $env['DB_DATABASE'] ?? '';
$dbUser = $env['DB_USERNAME'] ?? '';
$dbPass = $env['DB_PASSWORD'] ?? '';

$dangerous = [
    '2026_07_15_000001',
    '2026_07_16_000002',
    '2026_07_16_000003',
];

echo "<h1>Safe Migration Runner</h1>";

// Step 1: Backup
echo "<h2>1. Database Backup</h2>";
try {
    $pdo = new PDO("mysql:host=$dbHost;dbname=$dbName", $dbUser, $dbPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $backupDir = $basePath . '/storage/app/backups';
    if (!is_dir($backupDir)) {
        mkdir($backupDir, 0775, true);
    }
    $backupFile = $backupDir . '/backup_' . date('Y-m-d_H-i-s') . '.sql';
    $sql = "-- Backup: " . date('Y-m-d H:i:s') . "\n\n";

    foreach ($tables as $table) {
        $createTable = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM);
        $sql .= $createTable[1] . ";\n\n";

        $rows = $pdo->query("SELECT * FROM `$table`")->fetchAll(PDO::FETCH_NUM);
        if ($rows) {
            $columns = $pdo->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($rows as $row) {
                $escaped = array_map(function ($v) use ($pdo) {
                    return $v === null ? 'NULL' : $pdo->quote($v);
                }, $row);
                $sql .= "INSERT INTO `$table` (`" . implode('`,`', $columns) . "`) VALUES (" . implode(',', $escaped) . ");\n";
            }
        }
        $sql .= "\n";
    }

    file_put_contents($backupFile, $sql);
    echo "<p style='color:green'>✅ Backup saved: " . basename($backupFile) . " (" . count($tables) . " tables, " . number_format(filesize($backupFile)) . " bytes)</p>";
} catch (PDOException $e) {
    echo "<p style='color:red'>❌ Backup failed: " . $e->getMessage() . "</p>";
    echo "<p style='color:red'>STOPPING - do not proceed without backup!</p>";
    exit;
}

// Step 2: Check pending migrations
echo "<h2>2. Checking Pending Migrations</h2>";
$output = [];
exec("cd " . escapeshellarg($basePath) . " && php artisan migrate --pretend --force 2>&1", $output, $pretendCode);
$pending = [];
foreach ($output as $line) {
    if (preg_match('/^(\d{4}_\d{2}_\d{2}_[\w]+)/', $line, $m)) {
        $pending[] = $m[1];
    }
}
echo "<p>Pending migrations: " . count($pending) . "</p>";

// Step 3: Identify dangerous ones
$toRun = [];
$skipped = [];
foreach ($pending as $m) {
    $isDangerous = false;
    foreach ($dangerous as $d) {
        if (strpos($m, $d) === 0) {
            $isDangerous = true;
            break;
        }
    }
    if ($isDangerous) {
        $skipped[] = $m;
    } else {
        $toRun[] = $m;
    }
}

if ($skipped) {
    echo "<p style='color:orange'>⚠️ SKIPPED (dangerous - data loss risk):</p>";
    echo "<ul>";
    foreach ($skipped as $s) {
        echo "<li style='color:red'>$s</li>";
    }
    echo "</ul>";
}

if ($toRun) {
    echo "<p style='color:green'>Will run (safe):</p>";
    echo "<ul>";
    foreach ($toRun as $t) {
        echo "<li style='color:green'>$t</li>";
    }
    echo "</ul>";
}

// Step 4: Run safe migrations
echo "<h2>3. Running Safe Migrations</h2>";
if ($toRun) {
    foreach ($toRun as $migration) {
        $output = [];
        $returnCode = 0;
        exec("cd " . escapeshellarg($basePath) . " && php artisan migrate --force --path=database/migrations/" . $migration . ".php 2>&1", $output, $returnCode);
        $status = $returnCode === 0 ? "✅" : "❌";
        echo "<p>$status " . htmlspecialchars(implode(" ", $output)) . "</p>";
    }
    echo "<p style='color:green'>✅ Safe migrations completed</p>";
} else {
    echo "<p>No safe pending migrations to run.</p>";
}

// Step 5: Clear cache
echo "<h2>4. Clearing Cache</h2>";
exec("cd " . escapeshellarg($basePath) . " && php artisan config:clear && php artisan route:clear && php artisan view:clear && php artisan cache:clear 2>&1", $clearOutput);
echo "<pre>" . htmlspecialchars(implode("\n", $clearOutput)) . "</pre>";
echo "<p style='color:green'>✅ Cache cleared</p>";

echo "<p style='font-weight:bold;margin-top:20px;color:red;'>⚠️ DELETE this file immediately!</p>";
