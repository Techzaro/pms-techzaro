<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$tables = Illuminate\Support\Facades\DB::connection()->getDoctrineSchemaManager()->listTableNames();
echo implode(PHP_EOL, $tables);
