<?php
// Usage: php mark_migration_done.php 2026_08_07_000002_create_organization_billing_invoices_table
if ($argc < 2) {
    echo "Usage: php mark_migration_done.php <migration_name>\n";
    exit(1);
}
$migration = $argv[1];
try {
    $pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=saas_master','root','', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    // check
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM migrations WHERE migration = :m');
    $stmt->execute([':m'=>$migration]);
    $cnt = $stmt->fetchColumn();
    if ($cnt) {
        echo "Migration already marked: $migration\n";
        exit(0);
    }
    $batchStmt = $pdo->query('SELECT COALESCE(MAX(batch),0) as b FROM migrations');
    $batch = $batchStmt->fetchColumn();
    $batch++;
    $stmt = $pdo->prepare('INSERT INTO migrations (migration, batch) VALUES (:m, :b)');
    $stmt->execute([':m'=>$migration, ':b'=>$batch]);
    echo "Marked migration $migration as applied (batch $batch)\n";
} catch (PDOException $e) {
    echo 'Error: '.$e->getMessage()."\n";
}
