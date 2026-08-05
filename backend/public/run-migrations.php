<?php
/**
 * TEMPORARY MIGRATION RUNNER - SAFE VERSION
 * 
 * ⚠️ IMPORTANT: Delete this file immediately after running!
 * 
 * Features:
 * - Shows pending migrations BEFORE running
 * - Creates automatic backup before migrating
 * - Only runs when ?run=1 is in URL
 * - Safe for production use
 */

_PodsAutoloader = __DIR__ . '/../vendor/autoload.php';

if (!file_exists($PodsAutoloader)) {
    die('ERROR: vendor/autoload.php not found.');
}

require $PodsAutoloader;
$app = require_once __DIR__ . '/../bootstrap/app.php';

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

$runMode = isset($_GET['run']) && $_GET['run'] === '1';
$backupDir = __DIR__ . '/../database/backups';

?>
<!DOCTYPE html>
<html>
<head>
    <title>Migration Runner - SAFE</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; background: #0d1117; color: #c9d1d9; padding: 20px; margin: 0; }
        h1 { color: #ff6b6b; border-bottom: 2px solid #ff6b6b; padding-bottom: 10px; }
        h2 { color: #58a6ff; margin-top: 30px; }
        .success { color: #3fb950; }
        .error { color: #f85149; }
        .warning { color: #d29922; }
        .info { color: #58a6ff; }
        .safe { color: #3fb950; background: #0d2818; padding: 3px 8px; border-radius: 4px; }
        .danger { color: #f85149; background: #2d0d0d; padding: 3px 8px; border-radius: 4px; }
        pre { background: #161b22; padding: 15px; border: 1px solid #30363d; overflow-x: auto; border-radius: 6px; }
        .delete-box { background: #da3633; color: white; padding: 20px; font-size: 16px; font-weight: bold; margin: 20px 0; text-align: center; border-radius: 6px; }
        .btn { display: inline-block; padding: 12px 24px; font-size: 16px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; margin: 10px 5px; }
        .btn-danger { background: #da3633; color: white; }
        .btn-success { background: #238636; color: white; }
        .btn:hover { opacity: 0.9; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 20px; margin: 15px 0; }
        .migration-item { padding: 8px 12px; margin: 4px 0; border-radius: 4px; }
        .migration-safe { background: #0d2818; border-left: 3px solid #3fb950; }
        .migration-new { background: #0d2818; border-left: 3px solid #58a6ff; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #30363d; }
        th { background: #21262d; color: #58a6ff; }
    </style>
</head>
<body>
    <h1>⚠️ TEMPORARY MIGRATION RUNNER</h1>
    <div class="delete-box">
        🚨 DELETE THIS FILE IMMEDIATELY AFTER RUNNING! 🚨<br>
        File: backend/public/run-migrations.php
    </div>

<?php
try {
    // Get all migration files
    $migrationPath = __DIR__ . '/../database/migrations';
    $allMigrations = [];
    if (is_dir($migrationPath)) {
        $files = glob($migrationPath . '/*.php');
        foreach ($files as $file) {
            $name = basename($file, '.php');
            $allMigrations[$name] = $file;
        }
        ksort($allMigrations);
    }

    // Get already run migrations
    $migrated = DB::table('migrations')->pluck('migration')->toArray();
    
    // Find pending migrations
    $pending = [];
    foreach ($allMigrations as $name => $file) {
        if (!in_array($name, $migrated)) {
            $pending[$name] = $file;
        }
    }

    // Display status
    echo '<div class="card">';
    echo '<h2>📊 Database Migration Status</h2>';
    echo '<table>';
    echo '<tr><th>Total Migration Files</th><td>' . count($allMigrations) . '</td></tr>';
    echo '<tr><th>Already Run</th><td class="success">' . count($migrated) . '</td></tr>';
    echo '<tr><th>Pending</th><td class="' . (count($pending) > 0 ? 'warning' : 'success') . '">' . count($pending) . '</td></tr>';
    echo '</table>';
    echo '</div>';

    // Show pending migrations
    if (count($pending) > 0) {
        echo '<div class="card">';
        echo '<h2>📋 Pending Migrations (Will Run)</h2>';
        echo '<p class="info">Ye nayi migrations hain jo run hongi:</p>';
        foreach ($pending as $name => $file) {
            echo '<div class="migration-item migration-new">✓ ' . htmlspecialchars($name) . '</div>';
        }
        echo '</div>';
    } else {
        echo '<div class="card">';
        echo '<h2 class="success">✅ All Migrations Already Run!</h2>';
        echo '<p>Koi pending migration nahi hai.</p>';
        echo '</div>';
    }

    // Show already run migrations (last 10)
    echo '<div class="card">';
    echo '<h2>✅ Last 10 Run Migrations</h2>';
    echo '<pre>';
    $recentMigrated = DB::table('migrations')->orderByDesc('id')->limit(10)->get();
    foreach ($recentMigrated as $m) {
        echo "  Batch {$m->batch}: {$m->migration}\n";
    }
    echo '</pre>';
    echo '</div>';

    if (count($pending) > 0) {
        if (!$runMode) {
            // PREVIEW MODE - Show what will happen
            echo '<div class="card">';
            echo '<h2>🔒 Preview Mode</h2>';
            echo '<p class="warning">Abhi sirf preview hai - kuch run nahi hoga.</p>';
            echo '<p>Run karne ke liye ye URL open karein:</p>';
            $currentHost = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
            echo '<pre>' . htmlspecialchars($currentHost . '/run-migrations.php?run=1') . '</pre>';
            echo '<br>';
            echo '<a href="?run=1" class="btn btn-danger">🚀 RUN MIGRATIONS NOW</a>';
            echo '</div>';
        } else {
            // RUN MODE - Actually run migrations
            echo '<div class="card">';
            echo '<h2>🚀 Running Migrations...</h2>';
            
            // Create backup first
            echo '<p class="info">📦 Creating backup before migration...</p>';
            
            if (!is_dir($backupDir)) {
                mkdir($backupDir, 0755, true);
            }
            
            $backupFile = $backupDir . '/backup_' . date('Y-m-d_H-i-s') . '.sql';
            $tables = DB::select('SHOW TABLES');
            $dbName = DB::getDatabaseName();
            
            $backupSQL = "-- Database Backup: {$dbName}\n";
            $backupSQL .= "-- Date: " . date('Y-m-d H:i:s') . "\n";
            $backupSQL .= "-- Before running migrations\n\n";
            
            foreach ($tables as $table) {
                $tableName = reset($table);
                $backupSQL .= "-- Table: {$tableName}\n";
                $backupSQL .= "DROP TABLE IF EXISTS `{$tableName}`;\n";
                
                $createTable = DB::select("SHOW CREATE TABLE `{$tableName}`");
                if (isset($createTable[0])) {
                    $createTableSQL = $createTable[0]->{'Create Table'};
                    $backupSQL .= "{$createTableSQL};\n\n";
                }
            }
            
            file_put_contents($backupFile, $backupSQL);
            echo '<p class="success">✅ Backup saved: ' . basename($backupFile) . '</p>';
            echo '</div>';

            // Run migrations
            echo '<div class="card">';
            echo '<h2>🏃 Migration Output</h2>';
            echo '<pre>';
            
            ob_start();
            $exitCode = Artisan::call('migrate', ['--force' => true]);
            $output = ob_get_clean();
            
            echo htmlspecialchars($output);
            echo '</pre>';
            
            if ($exitCode === 0) {
                echo '<h2 class="success">✅ Migrations completed successfully!</h2>';
            } else {
                echo '<h2 class="error">❌ Migration failed with exit code: ' . $exitCode . '</h2>';
            }
            echo '</div>';

            // Show final status
            echo '<div class="card">';
            echo '<h2>📊 Final Status</h2>';
            $migratedAfter = DB::table('migrations')->orderBy('batch')->get();
            echo '<pre>';
            echo "Total migrations: " . $migratedAfter->count() . "\n\n";
            
            $latestBatch = $migratedAfter->max('batch');
            $latestMigrations = $migratedAfter->where('batch', $latestBatch);
            echo "Latest batch ({$latestBatch}):\n";
            foreach ($latestMigrations as $m) {
                echo "  ✓ {$m->migration}\n";
            }
            echo '</pre>';
            echo '</div>';

            // Show all tables
            echo '<div class="card">';
            echo '<h2>📋 All Database Tables</h2>';
            echo '<pre>';
            foreach ($tables as $table) {
                $tableName = reset($table);
                echo "  - {$tableName}\n";
            }
            echo '</pre>';
            echo '</div>';
        }
    }

} catch (\Exception $e) {
    echo '<div class="card">';
    echo '<h2 class="error">❌ ERROR:</h2>';
    echo '<pre class="error">';
    echo "Message: " . $e->getMessage() . "\n\n";
    echo "File: " . $e->getFile() . "\n";
    echo "Line: " . $e->getLine() . "\n\n";
    echo "Stack Trace:\n" . $e->getTraceAsString();
    echo '</pre>';
    echo '</div>';
}

?>
    <hr style="border-color: #30363d; margin: 30px 0;">
    <div class="delete-box">
        🚨 REMINDER: DELETE run-migrations.php IMMEDIATELY! 🚨
    </div>
    <div class="card">
        <h2>📝 Instructions</h2>
        <ol>
            <li>Ye file cPanel File Manager mein upload karein: <code>backend/public/run-migrations.php</code></li>
            <li>Browser mein open karein: <code>&lt;?php echo htmlspecialchars((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/run-migrations.php'); ?&gt;</code></li>
            <li>Pending migrations dekhein</li>
            <li>"RUN MIGRATIONS NOW" button click karein</li>
            <li><strong>TURANT DELETE karein ye file!</strong></li>
        </ol>
        <p class="warning">⚠️ Backup automatic ban jayega pehle - lekin phir bhi manually backup le sakte hain phpMyAdmin se.</p>
    </div>
</body>
</html>
