<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('organization_support_tickets')) {
            Schema::connection('mysql_master')->create('organization_support_tickets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('ticket_number', 50)->unique();
                $table->string('subject', 255);
                $table->text('message');
                $table->string('status', 50)->default('open');
                $table->string('priority', 20)->default('medium');
                $table->string('category', 50)->default('general');
                $table->string('assigned_to_name', 255)->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->timestamps();

                $table->index('organization_id');
                $table->index('status');
                $table->index('priority');
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_support_tickets');
    }
};
