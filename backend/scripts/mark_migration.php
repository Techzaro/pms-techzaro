<?php
try {
    $pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=saas_master','root','', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    // Determine current max batch
    $stmt = $pdo->query('SELECT MAX(batch) as mb FROM migrations');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $batch = ($row && $row['mb']) ? ((int)$row['mb']) : 1;
    $batch++;
    $migration = '2026_08_07_000001_create_organization_storage_usage_table';
    $stmt = $pdo->prepare('INSERT INTO migrations (migration, batch) VALUES (?, ?)');
    $stmt->execute([$migration, $batch]);
    echo "Inserted migration record for {$migration} with batch {$batch}\n";
} catch (PDOException $e) {
    echo 'Error: ' . $e->getMessage() . "\n";
    exit(1);
}
