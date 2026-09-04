<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'is_reopened')) {
                $table->boolean('is_reopened')->default(false)->index();
            }
            if (!Schema::hasColumn('tasks', 'is_transferred')) {
                $table->boolean('is_transferred')->default(false)->index();
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'is_reopened')) {
                $table->boolean('is_reopened')->default(false)->index();
            }
            if (!Schema::hasColumn('deliverables', 'is_transferred')) {
                $table->boolean('is_transferred')->default(false)->index();
            }
        });

        // Backfill data safely
        // 1. Reopened tasks -> status = 'in_progress', is_reopened = 1
        DB::table('tasks')
            ->where('status', 'reopened')
            ->update([
                'status' => 'in_progress',
                'is_reopened' => true,
            ]);

        // Tasks with reopen history (reopened_at or reopen_count > 0)
        DB::table('tasks')
            ->whereNotNull('reopened_at')
            ->orWhere('reopen_count', '>', 0)
            ->update(['is_reopened' => true]);

        // 2. Reopened deliverables -> status = 'in_progress', is_reopened = 1
        DB::table('deliverables')
            ->where('status', 'reopened')
            ->update([
                'status' => 'in_progress',
                'is_reopened' => true,
            ]);

        // Deliverables with reopen history
        DB::table('deliverables')
            ->whereNotNull('reopened_at')
            ->orWhere('reopen_count', '>', 0)
            ->update(['is_reopened' => true]);

        // 3. Transferred tasks (delegation_chain is not null and not '[]', or delegation_count > 0)
        DB::table('tasks')
            ->where(function ($query) {
                $query->whereNotNull('delegation_chain')
                    ->where('delegation_chain', '!=', '[]')
                    ->where('delegation_chain', '!=', '');
            })
            ->orWhere('delegation_count', '>', 0)
            ->update(['is_transferred' => true]);

        // 4. Transferred deliverables
        DB::table('deliverables')
            ->where(function ($query) {
                $query->whereNotNull('delegation_chain')
                    ->where('delegation_chain', '!=', '[]')
                    ->where('delegation_chain', '!=', '');
            })
            ->orWhere('delegation_count', '>', 0)
            ->update(['is_transferred' => true]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $cols = [];
            if (Schema::hasColumn('tasks', 'is_reopened')) { $cols[] = 'is_reopened'; }
            if (Schema::hasColumn('tasks', 'is_transferred')) { $cols[] = 'is_transferred'; }
            if (!empty($cols)) { $table->dropColumn($cols); }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $cols = [];
            if (Schema::hasColumn('deliverables', 'is_reopened')) { $cols[] = 'is_reopened'; }
            if (Schema::hasColumn('deliverables', 'is_transferred')) { $cols[] = 'is_transferred'; }
            if (!empty($cols)) { $table->dropColumn($cols); }
        });
    }
};
