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
        Schema::table('tasks', function (Blueprint $table) {
            if (! Schema::hasColumn('tasks', 'abandon_requested_by')) {
                $table->foreignId('abandon_requested_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('tasks', 'abandon_requested_at')) {
                $table->timestamp('abandon_requested_at')->nullable();
            }
            if (! Schema::hasColumn('tasks', 'abandon_reason')) {
                $table->text('abandon_reason')->nullable();
            }
            if (! Schema::hasColumn('tasks', 'abandoned_by')) {
                $table->foreignId('abandoned_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('tasks', 'abandoned_at')) {
                $table->timestamp('abandoned_at')->nullable();
            }
            if (! Schema::hasColumn('tasks', 'abandon_declined_by')) {
                $table->foreignId('abandon_declined_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('tasks', 'abandon_declined_at')) {
                $table->timestamp('abandon_declined_at')->nullable();
            }
            if (! Schema::hasColumn('tasks', 'abandon_decline_reason')) {
                $table->text('abandon_decline_reason')->nullable();
            }
            if (! Schema::hasColumn('tasks', 'previous_status')) {
                $table->string('previous_status')->nullable();
            }
        });

        Schema::table('deliverables', function (Blueprint $table) {
            if (! Schema::hasColumn('deliverables', 'abandon_requested_by')) {
                $table->foreignId('abandon_requested_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('deliverables', 'abandon_requested_at')) {
                $table->timestamp('abandon_requested_at')->nullable();
            }
            if (! Schema::hasColumn('deliverables', 'abandon_reason')) {
                $table->text('abandon_reason')->nullable();
            }
            if (! Schema::hasColumn('deliverables', 'abandoned_by')) {
                $table->foreignId('abandoned_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('deliverables', 'abandoned_at')) {
                $table->timestamp('abandoned_at')->nullable();
            }
            if (! Schema::hasColumn('deliverables', 'abandon_declined_by')) {
                $table->foreignId('abandon_declined_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('deliverables', 'abandon_declined_at')) {
                $table->timestamp('abandon_declined_at')->nullable();
            }
            if (! Schema::hasColumn('deliverables', 'abandon_decline_reason')) {
                $table->text('abandon_decline_reason')->nullable();
            }
            if (! Schema::hasColumn('deliverables', 'previous_status')) {
                $table->string('previous_status')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropForeign(['abandon_requested_by']);
            $table->dropForeign(['abandoned_by']);
            $table->dropForeign(['abandon_declined_by']);
            $table->dropColumn([
                'abandon_requested_by', 'abandon_requested_at', 'abandon_reason',
                'abandoned_by', 'abandoned_at', 'abandon_declined_by',
                'abandon_declined_at', 'abandon_decline_reason', 'previous_status',
            ]);
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropForeign(['abandon_requested_by']);
            $table->dropForeign(['abandoned_by']);
            $table->dropForeign(['abandon_declined_by']);
            $table->dropColumn([
                'abandon_requested_by', 'abandon_requested_at', 'abandon_reason',
                'abandoned_by', 'abandoned_at', 'abandon_declined_by',
                'abandon_declined_at', 'abandon_decline_reason', 'previous_status',
            ]);
        });
    }
};
