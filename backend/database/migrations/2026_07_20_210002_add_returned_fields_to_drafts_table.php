<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drafts', function (Blueprint $table) {
            $table->boolean('is_returned')->default(false)->after('is_important');
            $table->foreignId('returned_from_user_id')->nullable()->after('is_returned')->constrained('users')->nullOnDelete();
            $table->timestamp('returned_at')->nullable()->after('returned_from_user_id');
            $table->text('return_reason')->nullable()->after('returned_at');
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
