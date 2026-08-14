<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_comments', function (Blueprint $table) {
            if (!Schema::hasColumn('task_comments', 'delegation_id')) {
                $table->foreignId('delegation_id')->nullable()->constrained('task_delegations')->nullOnDelete();
                $table->index('delegation_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('task_comments', function (Blueprint $table) {
            $table->dropIndex(['delegation_id']);
            $table->dropColumn('delegation_id');
        });
    }
};
