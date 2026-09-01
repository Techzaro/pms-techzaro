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
            $table->unsignedBigInteger('kb_id')->nullable()->after('sidebar_notes');
            $table->unsignedBigInteger('event_id')->nullable()->after('kb_id');
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedBigInteger('kb_id')->nullable()->after('description');
            $table->unsignedBigInteger('event_id')->nullable()->after('kb_id');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->unsignedBigInteger('kb_id')->nullable()->after('description');
            $table->unsignedBigInteger('event_id')->nullable()->after('kb_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['kb_id', 'event_id']);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['kb_id', 'event_id']);
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn(['kb_id', 'event_id']);
        });
    }
};
