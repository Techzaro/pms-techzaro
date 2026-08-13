<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->foreignId('sender_user_id')->nullable()->after('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('related_module')->nullable()->after('type');
            $table->unsignedBigInteger('related_id')->nullable()->after('related_module');
            $table->string('title')->nullable()->after('message');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropColumn(['sender_user_id', 'related_module', 'related_id', 'title']);
        });
    }
};
