<?php
$pdo = DB::connection('mysql_master')->getPdo();
$pdo->exec("USE `pms_techxaro`");
$stmt = $pdo->query("SELECT type, COUNT(*) as cnt FROM notifications GROUP BY type ORDER BY cnt DESC");
$rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
foreach ($rows as $r) {
    echo $r['type'] . " : " . $r['cnt'] . PHP_EOL;
}
