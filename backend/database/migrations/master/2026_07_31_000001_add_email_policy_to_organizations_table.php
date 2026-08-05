<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'mysql_master';

    public function up(): void
    {
        Schema::connection($this->connection)->table('organizations', function (Blueprint $table) {
            if (!Schema::connection($this->connection)->hasColumn('organizations', 'email_policy')) {
                $table->string('email_policy')->default('standard')->after('timezone');
            }
        });
    }

    public function down(): void
    {
        Schema::connection($this->connection)->table('organizations', function (Blueprint $table) {
            $table->dropColumn('email_policy');
        });
    }
};
