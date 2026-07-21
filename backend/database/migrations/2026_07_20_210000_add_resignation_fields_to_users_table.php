<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('resigned_at')->nullable()->after('last_login_at');
            $table->foreignId('resigned_by')->nullable()->after('resigned_at')->constrained('users')->nullOnDelete();
            $table->text('resignation_notes')->nullable()->after('resigned_by');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['resigned_by']);
            $table->dropColumn(['resigned_at', 'resigned_by', 'resignation_notes']);
        });
    }
};
