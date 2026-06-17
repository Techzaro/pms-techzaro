<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$task = App\Models\Task::find(43);
if ($task) {
    echo "Task 43 found: " . $task->title . "\n";
    echo "Status: " . $task->status . "\n";
} else {
    echo "Task 43 NOT FOUND in database\n";
}
