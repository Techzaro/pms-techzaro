<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            if (!Schema::hasColumn('notifications', 'sender_user_id')) {
                $table->foreignId('sender_user_id')->nullable()->after('user_id')->constrained('users')->cascadeOnDelete();
            }
            if (!Schema::hasColumn('notifications', 'related_module')) {
                $table->string('related_module')->nullable();
            }
            if (!Schema::hasColumn('notifications', 'related_id')) {
                $table->unsignedBigInteger('related_id')->nullable();
            }
            if (!Schema::hasColumn('notifications', 'title')) {
                $table->string('title')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropColumn(['sender_user_id', 'related_module', 'related_id', 'title']);
        });
    }
};
