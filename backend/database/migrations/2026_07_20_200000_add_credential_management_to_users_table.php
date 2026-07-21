<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('credentials_managed_by_admin')->default(false)->after('must_change_password');
            $table->boolean('password_reset_locked')->default(false)->after('credentials_managed_by_admin');
            $table->foreignId('password_changed_by')->nullable()->after('password_reset_locked')->constrained('users')->nullOnDelete();
            $table->timestamp('password_changed_at')->nullable()->after('password_changed_by');
            $table->integer('password_version')->default(1)->after('password_changed_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['password_changed_by']);
            $table->dropColumn([
                'credentials_managed_by_admin',
                'password_reset_locked',
                'password_changed_by',
                'password_changed_at',
                'password_version',
            ]);
        });
    }
};
