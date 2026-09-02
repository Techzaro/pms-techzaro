<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Ye line ensure karegi ke ye table saas_master DB mein bane
    protected $connection = 'mysql_master';

    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('super_admin_users')) {
            Schema::connection('mysql_master')->create('super_admin_users', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->unique();
                $table->string('password');
                $table->boolean('active')->default(1);
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('super_admin_users');
    }
};