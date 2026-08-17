<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('organization_support_messages')) {
            Schema::connection('mysql_master')->create('organization_support_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('ticket_id')->constrained('organization_support_tickets')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->text('message');
                $table->string('sender_type', 50)->default('organization');
                $table->boolean('is_read')->default(false);
                $table->timestamps();

                $table->index('ticket_id');
                $table->index('sender_type');
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_support_messages');
    }
};
