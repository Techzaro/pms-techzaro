<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$p = App\Models\Project::find(5);
echo "assigned_users: " . json_encode($p->assigned_users) . "\n";
echo "created_by: " . json_encode($p->created_by) . "\n";
echo "team_id: " . json_encode($p->team_id) . "\n";
echo "team_ids: " . json_encode($p->team_ids) . "\n";

$memberIds = collect($p->assigned_users ?? []);
if ($p->created_by) { $memberIds->push($p->created_by); }
$teamIds = array_merge($p->team_id ? [$p->team_id] : [], $p->team_ids ?? []);
$memberIds = $memberIds->merge($teamIds)->filter()->unique()->values()->all();
echo "final memberIds: " . json_encode($memberIds) . "\n";

$users = App\Models\User::whereIn('id', $memberIds)->where('active', true)->select('id', 'name', 'email', 'role')->get();
echo "local users found: " . json_encode($users->toArray()) . "\n";
