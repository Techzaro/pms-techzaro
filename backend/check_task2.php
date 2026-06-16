<?php
require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$task = App\Models\Task::find(43);
if ($task) {
    echo "Task 43 FOUND: " . $task->title . PHP_EOL;
} else {
    echo "Task 43 NOT FOUND" . PHP_EOL;
}
