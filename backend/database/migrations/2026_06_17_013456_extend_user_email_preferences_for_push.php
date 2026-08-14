<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_email_preferences', function (Blueprint $table) {
            if (!Schema::hasColumn('user_email_preferences', 'browser_notifications')) {
                $table->boolean('browser_notifications')->default(true);
            }
            if (!Schema::hasColumn('user_email_preferences', 'mobile_push_notifications')) {
                $table->boolean('mobile_push_notifications')->default(true);
            }
        });
    }

    public function down(): void
    {
        Schema::table('user_email_preferences', function (Blueprint $table) {
            $table->dropColumn(['browser_notifications', 'mobile_push_notifications']);
        });
    }
};
