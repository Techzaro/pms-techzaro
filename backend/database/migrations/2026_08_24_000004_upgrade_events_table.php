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
        Schema::table('events', function (Blueprint $table) {
            if (!Schema::hasColumn('events', 'organizer_id')) {
                $table->unsignedBigInteger('organizer_id')->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('events', 'category_id')) {
                $table->unsignedBigInteger('category_id')->nullable()->after('type');
            }
            if (!Schema::hasColumn('events', 'location')) {
                $table->string('location', 255)->nullable()->after('description');
            }
            if (!Schema::hasColumn('events', 'meeting_link')) {
                $table->string('meeting_link', 2048)->nullable()->after('description');
            }
            if (!Schema::hasColumn('events', 'visibility_level')) {
                $table->string('visibility_level', 32)->default('public')->after('is_global');
            }
            if (!Schema::hasColumn('events', 'status')) {
                $table->string('status', 32)->default('scheduled')->after('visibility_level');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            if (Schema::hasColumn('events', 'status')) {
                $table->dropColumn('status');
            }
            if (Schema::hasColumn('events', 'visibility_level')) {
                $table->dropColumn('visibility_level');
            }
            if (Schema::hasColumn('events', 'meeting_link')) {
                $table->dropColumn('meeting_link');
            }
            if (Schema::hasColumn('events', 'location')) {
                $table->dropColumn('location');
            }
            if (Schema::hasColumn('events', 'category_id')) {
                $table->dropColumn('category_id');
            }
            if (Schema::hasColumn('events', 'organizer_id')) {
                $table->dropColumn('organizer_id');
            }
        });
    }
};
