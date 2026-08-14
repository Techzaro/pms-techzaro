<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'credentials_managed_by_admin')) {
                $table->boolean('credentials_managed_by_admin')->default(false);
            }
            if (!Schema::hasColumn('users', 'password_reset_locked')) {
                $table->boolean('password_reset_locked')->default(false);
            }
            if (!Schema::hasColumn('users', 'password_changed_by')) {
                $table->foreignId('password_changed_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('users', 'password_changed_at')) {
                $table->timestamp('password_changed_at')->nullable();
            }
            if (!Schema::hasColumn('users', 'password_version')) {
                $table->integer('password_version')->default(1);
            }
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
