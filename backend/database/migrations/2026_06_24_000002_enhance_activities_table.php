<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activities', function (Blueprint $table) {
            if (!Schema::hasColumn('activities', 'action')) {
                $table->string('action')->nullable();
            }
            if (!Schema::hasColumn('activities', 'entity_name')) {
                $table->string('entity_name')->nullable();
            }
            if (!Schema::hasColumn('activities', 'related_user_id')) {
                $table->foreignId('related_user_id')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('activities', 'metadata')) {
                $table->json('metadata')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('activities', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'created_at', 'action']);
            $table->dropIndex('related_user_id');
            $table->dropColumn(['action', 'entity_name', 'related_user_id', 'metadata']);
        });
    }
};
