<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverables', 'reopen_count')) {
                $table->integer('reopen_count')->default(0);
            }
            if (!Schema::hasColumn('deliverables', 'reopen_reason')) {
                $table->text('reopen_reason')->nullable();
            }
            if (!Schema::hasColumn('deliverables', 'submission_count')) {
                $table->integer('submission_count')->default(0);
            }
        });
    }

    public function down(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn(['reopen_count', 'reopen_reason', 'submission_count']);
        });
    }
};
