<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$tables = ['users', 'organizations', 'hrm_application_types', 'hrm_member_requests', 'hrm_request_histories', 'roles', 'departments'];
$res = [];
foreach($tables as $t) {
    if(Illuminate\Support\Facades\Schema::hasTable($t)) {
        $res[$t] = Illuminate\Support\Facades\Schema::getColumnListing($t);
    }
}
echo json_encode($res, JSON_PRETTY_PRINT);
