<?php
try {
    $pdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=saas_master','root','', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $stmt = $pdo->query("SELECT id, tokenable_id, name, expires_at, created_at FROM personal_access_tokens ORDER BY id DESC LIMIT 20");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) {
        echo implode(' | ', [$r['id'] ?? '', $r['tokenable_id'] ?? '', $r['name'] ?? '', $r['expires_at'] ?? '', $r['created_at'] ?? '']) . "\n";
    }
} catch (PDOException $e) {
    echo 'Error: ' . $e->getMessage() . "\n";
}
