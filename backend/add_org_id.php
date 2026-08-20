<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;

if(!Schema::hasColumn('users', 'organization_id')) { 
    Schema::table('users', function (Blueprint $table) { 
        $table->unsignedBigInteger('organization_id')->nullable(); 
    }); 
    DB::table('users')->update(['organization_id' => 1]); 
    echo "Column organization_id added to users table.\n"; 
} else { 
    DB::table('users')->whereNull('organization_id')->update(['organization_id' => 1]); 
    echo "Column already exists. Updated null values to 1.\n"; 
}
