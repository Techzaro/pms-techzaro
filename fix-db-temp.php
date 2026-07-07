<?php
/**
 * TEMPORARY FIX - Upload to pmsv2.api.techxaro.com/public/, run once, then DELETE.
 */

$envPath = dirname(__DIR__) . '/.env';
if (!file_exists($envPath)) {
    $envPath = dirname(__DIR__) . '/.env.production';
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

$host = $env['DB_HOST'] ?? 'localhost';
$db   = $env['DB_DATABASE'] ?? '';
$user = $env['DB_USERNAME'] ?? '';
$pass = $env['DB_PASSWORD'] ?? '';

echo "<h3>DB Config Found:</h3>";
echo "<pre>";
echo "Host: $host\n";
echo "Database: " . ($db ?: '(EMPTY)') . "\n";
echo "Username: " . ($user ?: '(EMPTY)') . "\n";
echo "Password: " . ($pass ? '****' : '(EMPTY)') . "\n";
echo "</pre>";

if (!$db) {
    echo "<p style='color:red'>❌ DB_DATABASE is empty in .env file!</p>";
    echo "<p>Check your .env on cPanel and make sure DB_DATABASE is set.</p>";
    exit;
}

try {
    $dsn = "mysql:host=$host;dbname=$db";
    $pdo = new PDO($dsn, $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec("ALTER TABLE users MODIFY COLUMN gross_salary VARCHAR(255) NULL");
    echo "<p style='color:green'>✅ gross_salary column updated to VARCHAR(255)</p>";

    $pdo->exec("ALTER TABLE users MODIFY COLUMN other_document TEXT NULL");
    echo "<p style='color:green'>✅ other_document column updated to TEXT</p>";

    echo "<p style='font-weight:bold;margin-top:20px;color:red;'>⚠️ DELETE this file immediately!</p>";
} catch (PDOException $e) {
    echo "<p style='color:red'>❌ Error: " . $e->getMessage() . "</p>";
}
