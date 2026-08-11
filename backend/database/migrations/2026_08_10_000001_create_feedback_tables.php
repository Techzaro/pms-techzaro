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
        Schema::create('feedback', function (Blueprint $table) {
            $table->id();
            $table->string('reference_number')->unique();
            $table->enum('feedback_type', [
                'Bug Report',
                'Feature Request',
                'General Suggestion',
                'Feature Rating',
                'General Feedback',
            ]);
            $table->string('subject');
            $table->text('description');
            $table->enum('priority', ['Low', 'Medium', 'High', 'Urgent'])->default('Medium')->nullable();
            $table->enum('status', [
                'New',
                'Under Review',
                'Accepted',
                'Planned',
                'In Development',
                'Testing',
                'Resolved',
                'Closed',
                'Rejected',
            ])->default('New');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->string('screenshot_path')->nullable();
            $table->string('recording_path')->nullable();
            $table->string('attachment_path')->nullable();

            // Auto-captured information
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->string('organization_name')->nullable();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('user_name');
            $table->string('user_role');
            $table->string('module')->nullable();
            $table->string('current_page')->nullable();
            $table->timestamp('submitted_at')->useCurrent();
            $table->string('browser')->nullable();
            $table->string('operating_system')->nullable();
            $table->string('device_type')->nullable();
            $table->string('ip_address')->nullable();
            $table->string('app_version')->nullable();

            $table->timestamps();

            // Indexes for fast searching and filtering
            $table->index('feedback_type');
            $table->index('status');
            $table->index('priority');
            $table->index('user_id');
            $table->index('organization_id');
            $table->index('created_at');
        });

        Schema::create('feedback_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('feedback_id')->constrained('feedback')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action'); // submitted, viewed, assigned, priority_changed, status_changed, note_added, resolved, closed, etc.
            $table->text('details')->nullable();
            $table->timestamps();
        });

        Schema::create('feedback_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('feedback_id')->constrained('feedback')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('note');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('feedback_notes');
        Schema::dropIfExists('feedback_activity_logs');
        Schema::dropIfExists('feedback');
    }
};
