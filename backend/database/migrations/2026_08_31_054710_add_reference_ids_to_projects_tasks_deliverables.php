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
        Schema::table('projects', function (Blueprint $table) {
            if (!Schema::hasColumn('projects', 'kb_ids')) { $table->json('kb_ids')->nullable(); }
            if (!Schema::hasColumn('projects', 'event_ids')) { $table->json('event_ids')->nullable(); }
        });
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'kb_ids')) { $table->json('kb_ids')->nullable(); }
            if (!Schema::hasColumn('tasks', 'event_ids')) { $table->json('event_ids')->nullable(); }
        });
        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'kb_ids')) { $table->json('kb_ids')->nullable(); }
            if (!Schema::hasColumn('deliverables', 'event_ids')) { $table->json('event_ids')->nullable(); }
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) { $table->dropColumn(['kb_ids', 'event_ids']); });
        Schema::table('tasks', function (Blueprint $table) { $table->dropColumn(['kb_ids', 'event_ids']); });
        Schema::table('deliverables', function (Blueprint $table) { $table->dropColumn(['kb_ids', 'event_ids']); });
    }
};
