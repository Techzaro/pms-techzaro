<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$dbs = ['pms_tenant_techxaro-one', 'pms_tenant_farhan-cor'];
foreach ($dbs as $db) {
    echo "\n=== $db ===\n";
    $pdo = new PDO("mysql:host=127.0.0.1;port=3306;dbname=$db;charset=utf8mb4", 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $tables = $pdo->query("SHOW TABLES LIKE 'personal_access_tokens'")->fetchAll(PDO::FETCH_COLUMN);
    if (empty($tables)) {
        echo "No personal_access_tokens table!\n";
        continue;
    }
    $count = $pdo->query("SELECT COUNT(*) FROM personal_access_tokens")->fetchColumn();
    echo "Tokens: $count\n";
    $rows = $pdo->query("SELECT id, tokenable_type, tokenable_id, name, LEFT(token, 20) as token_prefix, expires_at FROM personal_access_tokens ORDER BY id DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) {
        echo "  ID:{$r['id']} type:{$r['tokenable_type']} id:{$r['tokenable_id']} name:{$r['name']} expires:{$r['expires_at']}\n";
    }
}
