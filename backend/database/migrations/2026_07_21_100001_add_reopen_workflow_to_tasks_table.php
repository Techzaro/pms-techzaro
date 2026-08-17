<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            if (!Schema::hasColumn('tasks', 'reopen_count')) {
                $table->integer('reopen_count')->default(0);
            }
            if (!Schema::hasColumn('tasks', 'reopen_reason')) {
                $table->text('reopen_reason')->nullable();
            }
            if (!Schema::hasColumn('tasks', 'submission_count')) {
                $table->integer('submission_count')->default(0);
            }
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['reopen_count', 'reopen_reason', 'submission_count']);
        });
    }
};
