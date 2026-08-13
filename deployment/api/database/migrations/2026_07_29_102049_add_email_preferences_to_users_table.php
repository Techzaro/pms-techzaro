<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // 1. Run the migration: Adds notification_preferences JSON column to store both Email and Desktop notification settings.
     
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Adds 'notification_preferences' column if it doesn't already exist
            if (!Schema::hasColumn('users', 'notification_preferences')) {
                $table->json('notification_preferences')->nullable();
            }
        });
    }

    // 2. Reverse the migration.
     
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'notification_preferences')) {
                $table->dropColumn('notification_preferences');
            }
            if (Schema::hasColumn('users', 'email_preferences')) {
                $table->dropColumn('email_preferences');
            }
        });
    }
};