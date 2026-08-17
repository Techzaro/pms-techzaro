<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            $table->integer('reopen_count')->default(0)->after('reopen_file_name');
            $table->text('reopen_reason')->nullable()->after('reopen_count');
            $table->integer('submission_count')->default(0)->after('reopen_reason');
        });
    }

    public function down(): void
    {
        Schema::table('deliverables', function (Blueprint $table) {
            $table->dropColumn(['reopen_count', 'reopen_reason', 'submission_count']);
        });
    }
};
