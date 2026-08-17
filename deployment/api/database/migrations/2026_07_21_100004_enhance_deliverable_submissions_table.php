<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverable_submissions', function (Blueprint $table) {
            $table->integer('version_number')->default(1)->after('file_name');
            $table->string('status', 32)->default('pending')->after('version_number');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete()->after('status');
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->foreignId('reopened_by')->nullable()->constrained('users')->nullOnDelete()->after('approved_at');
            $table->timestamp('reopened_at')->nullable()->after('reopened_by');
            $table->text('reopen_reason')->nullable()->after('reopened_at');
        });
    }

    public function down(): void
    {
        Schema::table('deliverable_submissions', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropForeign(['reopened_by']);
            $table->dropColumn([
                'version_number', 'status', 'approved_by', 'approved_at',
                'reopened_by', 'reopened_at', 'reopen_reason',
            ]);
        });
    }
};
