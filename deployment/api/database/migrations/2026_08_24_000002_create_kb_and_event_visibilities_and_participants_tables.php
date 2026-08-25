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
        if (!Schema::hasTable('kb_visibilities')) {
            Schema::create('kb_visibilities', function (Blueprint $table) {
                $table->id();
                $table->foreignId('knowledge_base_id')->constrained('knowledge_bases')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
                $table->foreignId('team_id')->nullable()->constrained('teams')->cascadeOnDelete();
                $table->string('department', 100)->nullable();
                $table->string('role', 50)->nullable();
                $table->boolean('is_visible')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('event_visibilities')) {
            Schema::create('event_visibilities', function (Blueprint $table) {
                $table->id();
                $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
                $table->foreignId('team_id')->nullable()->constrained('teams')->cascadeOnDelete();
                $table->string('department', 100)->nullable();
                $table->string('role', 50)->nullable();
                $table->boolean('is_visible')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('event_participants')) {
            Schema::create('event_participants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('status', 32)->default('invited'); // invited, accepted, declined, tentative
                $table->text('response_notes')->nullable();
                $table->boolean('attended')->default(false);
                $table->timestamps();

                $table->unique(['event_id', 'user_id']);
            });
        }

        if (!Schema::hasTable('kb_versions')) {
            Schema::create('kb_versions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('knowledge_base_id')->constrained('knowledge_bases')->cascadeOnDelete();
                $table->integer('version_number')->default(1);
                $table->string('title');
                $table->longText('content')->nullable();
                $table->string('file_path')->nullable();
                $table->string('file_name')->nullable();
                $table->string('change_summary')->nullable();
                $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_versions');
        Schema::dropIfExists('event_participants');
        Schema::dropIfExists('event_visibilities');
        Schema::dropIfExists('kb_visibilities');
    }
};
