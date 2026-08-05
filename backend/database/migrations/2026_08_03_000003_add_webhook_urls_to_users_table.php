<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('slack_webhook_url')->nullable()->after('notification_preferences');
            $table->text('google_chat_webhook_url')->nullable()->after('slack_webhook_url');
            $table->text('ms_teams_webhook_url')->nullable()->after('google_chat_webhook_url');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['slack_webhook_url', 'google_chat_webhook_url', 'ms_teams_webhook_url']);
        });
    }
};
