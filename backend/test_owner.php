<?php
$pdo = new PDO('mysql:host=127.0.0.1;port=3306', 'root', '');
$stmt = $pdo->query("SELECT id, name, email, must_change_password, active, LEFT(password, 20) as pw_prefix FROM pms_techxaro.users WHERE email = 'arbab.ali@techxaro.com' OR professional_email = 'arbab.ali@techxaro.com'");
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if ($user) {
    foreach ($user as $k => $v) echo "  {$k}: {$v}\n";
} else {
    echo "User not found. Searching all TechXaro users...\n";
    $all = $pdo->query("SELECT id, name, email, professional_email, must_change_password, active FROM pms_techxaro.users LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($all as $u) echo "  id={$u['id']} name={$u['name']} email={$u['email']} prof={$u['professional_email']} mcp={$u['must_change_password']} active={$u['active']}\n";
}
$pdo = null;
