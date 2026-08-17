<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('super_admin_users')) {
            Schema::connection('mysql_master')->create('super_admin_users', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->unique();
                $table->string('password');
                $table->string('role', 50)->default('super_admin');
                $table->boolean('active')->default(true);
                $table->boolean('must_change_password')->default(true);
                $table->timestamp('last_login_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('super_admin_users');
    }
};
