<?php
// Usage: php backup_and_rename_table.php
try {
    $pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=saas_master','root','', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $old = 'organization_storage_usage';
    $timestamp = date('Ymd_His');
    $new = $old . '_bkp_' . $timestamp;
    echo "Renaming $old to $new...\n";
    $pdo->exec("RENAME TABLE `$old` TO `$new`;");
    echo "Renamed successfully.\n";
} catch (PDOException $e) {
    echo 'Error: ' . $e->getMessage() . "\n";
}
