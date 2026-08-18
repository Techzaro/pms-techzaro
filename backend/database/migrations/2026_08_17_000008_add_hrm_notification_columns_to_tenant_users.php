<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $columns = [
            'notification_preferences' => fn (Blueprint $table) => $table->json('notification_preferences')->nullable(),
            'slack_webhook_url' => fn (Blueprint $table) => $table->text('slack_webhook_url')->nullable(),
            'google_chat_webhook_url' => fn (Blueprint $table) => $table->text('google_chat_webhook_url')->nullable(),
            'ms_teams_webhook_url' => fn (Blueprint $table) => $table->text('ms_teams_webhook_url')->nullable(),
        ];

        foreach ($columns as $column => $definition) {
            if (!Schema::hasColumn('users', $column)) {
                Schema::table('users', $definition);
            }
        }
    }

    public function down(): void
    {
        $columns = ['notification_preferences', 'slack_webhook_url', 'google_chat_webhook_url', 'ms_teams_webhook_url'];
        $existing = array_values(array_filter($columns, fn (string $column) => Schema::hasColumn('users', $column)));

        if ($existing !== []) {
            Schema::table('users', fn (Blueprint $table) => $table->dropColumn($existing));
        }
    }
};
