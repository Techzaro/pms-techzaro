<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('hrm_esign_envelopes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('reference')->unique();
            $table->string('candidate_name');
            $table->string('candidate_email');
            $table->string('candidate_id')->nullable()->index();
            $table->string('job_title');
            $table->string('department')->nullable();
            $table->string('employment_type')->default('Full-time');
            $table->decimal('base_salary', 14, 2)->nullable();
            $table->string('currency', 8)->default('PKR');
            $table->date('start_date')->nullable();
            $table->date('expires_at');
            $table->string('status')->default('draft')->index();
            $table->unsignedBigInteger('created_by');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('viewed_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('voided_at')->nullable();
            $table->string('evidence_hash', 64)->nullable();
            $table->timestamps();
        });

        Schema::create('hrm_esign_documents', function (Blueprint $table) {
            $table->id();
            $table->uuid('envelope_id')->index();
            $table->string('type');
            $table->string('title');
            $table->unsignedInteger('version')->default(1);
            $table->string('required_action');
            $table->longText('content');
            $table->string('content_hash', 64);
            $table->string('status')->default('pending');
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('signed_at')->nullable();
            $table->string('signature_method')->nullable();
            $table->longText('signature_value')->nullable();
            $table->string('completed_hash', 64)->nullable();
            $table->timestamps();
            $table->foreign('envelope_id')->references('id')->on('hrm_esign_envelopes')->cascadeOnDelete();
            $table->unique(['envelope_id', 'type']);
        });

        Schema::create('hrm_esign_tokens', function (Blueprint $table) {
            $table->id();
            $table->uuid('envelope_id')->index();
            $table->string('token_hash', 64)->unique();
            // DATETIME avoids legacy MySQL/MariaDB implicitly adding ON UPDATE
            // CURRENT_TIMESTAMP to the first non-null TIMESTAMP column.
            $table->dateTime('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->string('otp_hash', 64)->nullable();
            $table->dateTime('otp_expires_at')->nullable();
            $table->unsignedTinyInteger('otp_attempts')->default(0);
            $table->timestamp('identity_verified_at')->nullable();
            $table->timestamps();
            $table->foreign('envelope_id')->references('id')->on('hrm_esign_envelopes')->cascadeOnDelete();
        });

        Schema::create('hrm_esign_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('envelope_id')->index();
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->string('actor_type');
            $table->string('event_type')->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->json('metadata')->nullable();
            $table->string('event_hash', 64);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('envelope_id')->references('id')->on('hrm_esign_envelopes')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hrm_esign_events');
        Schema::dropIfExists('hrm_esign_tokens');
        Schema::dropIfExists('hrm_esign_documents');
        Schema::dropIfExists('hrm_esign_envelopes');
    }
};
