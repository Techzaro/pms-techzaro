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
        // 1. Update task_saved_views table if it exists
        if (Schema::hasTable('task_saved_views')) {
            Schema::table('task_saved_views', function (Blueprint $table) {
                if (!Schema::hasColumn('task_saved_views', 'sort_parameters')) {
                    $table->json('sort_parameters')->nullable()->after('filters');
                }
                if (!Schema::hasColumn('task_saved_views', 'view_name')) {
                    $table->string('view_name')->nullable()->after('name');
                }
                if (!Schema::hasColumn('task_saved_views', 'filter_payload')) {
                    $table->json('filter_payload')->nullable()->after('filters');
                }
            });
        } else {
            Schema::create('task_saved_views', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->string('name');
                $table->string('view_name')->nullable();
                $table->json('filters')->nullable();
                $table->json('filter_payload')->nullable();
                $table->json('sort_parameters')->nullable();
                $table->boolean('is_default')->default(false);
                $table->timestamps();

                $table->index(['user_id', 'is_default']);
            });
        }

        // 2. Create saved_views table for generic SRS Saved Views if not exists
        if (!Schema::hasTable('saved_views')) {
            Schema::create('saved_views', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->string('view_name');
                $table->string('name')->nullable();
                $table->json('filter_payload')->nullable();
                $table->json('filters')->nullable();
                $table->json('sort_parameters')->nullable();
                $table->boolean('is_default')->default(false);
                $table->timestamps();

                $table->index(['user_id', 'is_default']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('saved_views');
    }
};
