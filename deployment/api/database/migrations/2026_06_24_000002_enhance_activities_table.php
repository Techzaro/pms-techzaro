<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activities', function (Blueprint $table) {
            $table->string('action')->after('activity_type')->nullable();
            $table->string('entity_name')->after('related_id')->nullable();
            $table->foreignId('related_user_id')->after('entity_name')->nullable()->constrained('users')->nullOnDelete();
            $table->json('metadata')->after('related_user_id')->nullable();

            $table->index(['user_id', 'created_at', 'action']);
            $table->index('related_user_id');
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
