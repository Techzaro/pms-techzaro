<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'current_owner')) {
                $table->unsignedBigInteger('current_owner')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'original_assigner')) {
                $table->unsignedBigInteger('original_assigner')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'delegation_chain')) {
                $table->json('delegation_chain')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'approval_chain')) {
                $table->json('approval_chain')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'delegation_count')) {
                $table->integer('delegation_count')->default(0);
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'current_owner')) {
                $table->unsignedBigInteger('current_owner')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'original_assigner')) {
                $table->unsignedBigInteger('original_assigner')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'delegation_chain')) {
                $table->json('delegation_chain')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'approval_chain')) {
                $table->json('approval_chain')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'delegation_count')) {
                $table->integer('delegation_count')->default(0);
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['current_owner', 'original_assigner', 'delegation_chain', 'approval_chain', 'delegation_count']);
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn(['current_owner', 'original_assigner', 'delegation_chain', 'approval_chain', 'delegation_count']);
        });
    }
};
