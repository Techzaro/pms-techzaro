<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'resigned_at')) {
                $table->timestamp('resigned_at')->nullable();
            }
            if (!Schema::hasColumn('users', 'resigned_by')) {
                $table->foreignId('resigned_by')->nullable()->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('users', 'resignation_notes')) {
                $table->text('resignation_notes')->nullable();
            }
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
