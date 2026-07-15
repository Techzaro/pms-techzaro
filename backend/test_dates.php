<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->handle();

$p = App\Models\Project::find(74);
echo "Before update: " . DB::table('projects')->where('id', 74)->value('user_due_dates') . "\n";

$p->user_due_dates = ['106' => '2026-07-16T23:20', '103' => '2026-07-15T20:16'];
$p->save();

echo "After update: " . DB::table('projects')->where('id', 74)->value('user_due_dates') . "\n";
echo "Model read: " . json_encode(App\Models\Project::find(74)->user_due_dates) . "\n";
echo "Is object: " . (is_object(App\Models\Project::find(74)->user_due_dates) ? 'yes' : 'no') . "\n";
