<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$users = App\Models\User::select('id', 'name', 'employment_contract', 'offer_letter', 'cv', 'latest_education_cert')->limit(5)->get();
foreach ($users as $u) {
    echo "User {$u->id} ({$u->name}): ec=" . ($u->employment_contract ?: 'NULL') . " | ol=" . ($u->offer_letter ?: 'NULL') . " | cv=" . ($u->cv ?: 'NULL') . " | edu=" . ($u->latest_education_cert ?: 'NULL') . PHP_EOL;
}
