<?php
require_once __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

for ($i = 185; $i <= 190; $i++) {
    $t = App\Models\Task::find($i);
    echo ($t ? "$i: {$t->title}\n" : "$i: NOT FOUND\n");
}
