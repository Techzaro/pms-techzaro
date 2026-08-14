<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drafts', function (Blueprint $table) {
            if (!Schema::hasColumn('drafts', 'is_returned')) {
                $table->boolean('is_returned')->default(false);
            }
            if (!Schema::hasColumn('drafts', 'returned_from_user_id')) {
                $table->foreignId('returned_from_user_id')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('drafts', 'returned_at')) {
                $table->timestamp('returned_at')->nullable();
            }
            if (!Schema::hasColumn('drafts', 'return_reason')) {
                $table->text('return_reason')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('drafts', function (Blueprint $table) {
            $table->dropForeign(['returned_from_user_id']);
            $table->dropColumn(['is_returned', 'returned_from_user_id', 'returned_at', 'return_reason']);
        });
    }
};
