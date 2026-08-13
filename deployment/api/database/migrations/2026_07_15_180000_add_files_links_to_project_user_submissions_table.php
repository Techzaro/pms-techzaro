<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_user_submissions', function (Blueprint $table) {
            $table->string('file_path')->nullable()->after('comment');
            $table->string('file_name')->nullable()->after('file_path');
            $table->json('links')->nullable()->after('file_name');
        });
    }

    public function down(): void
    {
        Schema::table('project_user_submissions', function (Blueprint $table) {
            $table->dropColumn(['file_path', 'file_name', 'links']);
        });
    }
};
