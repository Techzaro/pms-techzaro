<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->unsignedBigInteger('current_owner')->nullable()->after('assigned_to');
            $table->unsignedBigInteger('original_assigner')->nullable()->after('current_owner');
            $table->json('delegation_chain')->nullable()->after('original_assigner');
            $table->json('approval_chain')->nullable()->after('delegation_chain');
            $table->integer('delegation_count')->default(0)->after('approval_chain');
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->unsignedBigInteger('current_owner')->nullable()->after('assigned_to');
            $table->unsignedBigInteger('original_assigner')->nullable()->after('current_owner');
            $table->json('delegation_chain')->nullable()->after('original_assigner');
            $table->json('approval_chain')->nullable()->after('delegation_chain');
            $table->integer('delegation_count')->default(0)->after('approval_chain');
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn(['current_owner', 'original_assigner', 'delegation_chain', 'approval_chain', 'delegation_count']);
        });

        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn(['current_owner', 'original_assigner', 'delegation_chain', 'approval_chain', 'delegation_count']);
        });
    }
};
