<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (!Schema::hasColumn('projects', 'client_name')) {
                $table->string('client_name')->nullable()->after('website_link');
            }
            if (!Schema::hasColumn('projects', 'category')) {
                $table->string('category')->nullable()->after('client_name');
            }
            if (!Schema::hasColumn('projects', 'budget')) {
                $table->decimal('budget', 12, 2)->nullable()->after('category');
            }
            if (!Schema::hasColumn('projects', 'priority')) {
                $table->string('priority', 32)->default('Medium')->after('budget');
            }
            if (!Schema::hasColumn('projects', 'goals_checklist')) {
                $table->json('goals_checklist')->nullable();
            }
            if (!Schema::hasColumn('projects', 'sidebar_notes')) {
                $table->text('sidebar_notes')->nullable();
            }
        });

        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'project_id')) {
                $table->foreignId('project_id')->after('id')->constrained()->cascadeOnDelete();
            }
            if (!Schema::hasColumn('tasks', 'title')) {
                $table->string('title')->default('')->after('project_id');
            }
            if (!Schema::hasColumn('tasks', 'description')) {
                $table->text('description')->nullable()->after('title');
            }
            if (!Schema::hasColumn('tasks', 'status')) {
                $table->string('status', 64)->default('pending')->after('description');
            }
            if (!Schema::hasColumn('tasks', 'priority')) {
                $table->string('priority', 32)->default('Medium')->after('status');
            }
            if (!Schema::hasColumn('tasks', 'start_date')) {
                $table->dateTime('start_date')->nullable()->after('priority');
            }
            if (!Schema::hasColumn('tasks', 'end_date')) {
                $table->dateTime('end_date')->nullable()->after('start_date');
            }
            if (!Schema::hasColumn('tasks', 'assigned_to')) {
                $table->foreignId('assigned_to')->nullable()->after('end_date')->constrained('users')->nullOnDelete();
            }
        });

        if (!Schema::hasTable('project_milestones')) {
            Schema::create('project_milestones', function (Blueprint $table) {
                $table->id();
                $table->foreignId('project_id')->constrained()->cascadeOnDelete();
                $table->string('title');
                $table->date('due_date')->nullable();
                $table->string('status', 32)->default('planned');
                $table->unsignedTinyInteger('sort_order')->default(0);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('project_activities')) {
            Schema::create('project_activities', function (Blueprint $table) {
                $table->id();
                $table->foreignId('project_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                $table->string('summary');
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('project_files')) {
            Schema::create('project_files', function (Blueprint $table) {
                $table->id();
                $table->foreignId('project_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->string('url')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('project_files');
        Schema::dropIfExists('project_activities');
        Schema::dropIfExists('project_milestones');

        Schema::table('tasks', function (Blueprint $table) {
            if (Schema::hasColumn('tasks', 'assigned_to')) {
                $table->dropForeign(['assigned_to']);
                $table->dropColumn('assigned_to');
            }
            foreach (['end_date', 'start_date', 'priority', 'status', 'description', 'title', 'project_id'] as $col) {
                if (Schema::hasColumn('tasks', $col)) {
                    $table->dropColumn($col);
                }
            }
        });

        Schema::table('projects', function (Blueprint $table) {
            foreach (['sidebar_notes', 'goals_checklist', 'priority', 'budget', 'category', 'client_name'] as $col) {
                if (Schema::hasColumn('projects', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
