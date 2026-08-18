<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('hrm_notifications')) {
            Schema::table('hrm_notifications', function (Blueprint $table) {
                if (!Schema::hasColumn('hrm_notifications', 'user_id')) {
                    $table->unsignedBigInteger('user_id')->nullable()->after('id');
                }
                if (!Schema::hasColumn('hrm_notifications', 'is_read')) {
                    $table->boolean('is_read')->default(false)->after('message');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('hrm_notifications')) {
            Schema::table('hrm_notifications', function (Blueprint $table) {
                if (Schema::hasColumn('hrm_notifications', 'user_id')) {
                    $table->dropColumn('user_id');
                }
                if (Schema::hasColumn('hrm_notifications', 'is_read')) {
                    $table->dropColumn('is_read');
                }
            });
        }
    }
};
