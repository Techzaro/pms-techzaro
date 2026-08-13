<?php

$dsn = 'mysql:host=127.0.0.1;port=3306;dbname=saas_master;charset=utf8mb4';
$user = 'root';
$pass = '';
try {
    $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('RENAME TABLE organization_storage_usage TO organization_storage_usages');
    echo "Renamed table successfully\n";
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
