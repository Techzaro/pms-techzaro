<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hrm_candidates', function (Blueprint $table) {
            $table->string('resume_file')->nullable()->after('resume_url');
            $table->integer('ai_score')->nullable()->default(0)->after('resume_file');
            $table->text('ai_analysis')->nullable()->after('ai_score');
            $table->string('cnic')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('hrm_candidates', function (Blueprint $table) {
            $table->dropColumn(['resume_file', 'ai_score', 'ai_analysis', 'cnic']);
        });
    }
};
