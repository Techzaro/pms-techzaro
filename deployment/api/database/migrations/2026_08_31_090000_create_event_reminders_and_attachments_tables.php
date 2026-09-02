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
        // 1. Ensure events table columns
        Schema::table('events', function (Blueprint $table) {
            if (!Schema::hasColumn('events', 'created_by')) {
                $table->unsignedBigInteger('created_by')->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('events', 'meeting_link')) {
                $table->string('meeting_link', 2048)->nullable()->after('description');
            }
            if (!Schema::hasColumn('events', 'status')) {
                $table->string('status', 32)->default('scheduled')->after('visibility_level');
            }
            if (!Schema::hasColumn('events', 'start_time')) {
                $table->time('start_time')->nullable()->after('start_date');
            }
            if (!Schema::hasColumn('events', 'end_time')) {
                $table->time('end_time')->nullable()->after('end_date');
            }
        });

        // 2. Create event_reminders table
        if (!Schema::hasTable('event_reminders')) {
            Schema::create('event_reminders', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('event_id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->integer('value')->default(15);
                $table->string('unit', 16)->default('minutes'); // minutes, hours, days
                $table->boolean('is_sent')->default(false);
                $table->timestamp('sent_at')->nullable();
                $table->timestamps();

                $table->foreign('event_id')->references('id')->on('events')->onDelete('cascade');
                $table->foreign('user_id')->references('id')->on('users')->onDelete('set null');
                $table->index(['event_id', 'is_sent']);
            });
        }

        // 3. Create event_attachments table
        if (!Schema::hasTable('event_attachments')) {
            Schema::create('event_attachments', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('event_id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('file_name', 255);
                $table->string('file_path', 1024);
                $table->unsignedBigInteger('file_size')->default(0);
                $table->string('mime_type', 128)->nullable();
                $table->timestamps();

                $table->foreign('event_id')->references('id')->on('events')->onDelete('cascade');
                $table->foreign('user_id')->references('id')->on('users')->onDelete('set null');
                $table->index('event_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('event_attachments');
        Schema::dropIfExists('event_reminders');

        Schema::table('events', function (Blueprint $table) {
            if (Schema::hasColumn('events', 'created_by')) {
                $table->dropColumn('created_by');
            }
            if (Schema::hasColumn('events', 'start_time')) {
                $table->dropColumn('start_time');
            }
            if (Schema::hasColumn('events', 'end_time')) {
                $table->dropColumn('end_time');
            }
        });
    }
};
