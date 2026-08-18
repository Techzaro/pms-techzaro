<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hrm_candidates', function (Blueprint $table) {
            if (!Schema::hasColumn('hrm_candidates', 'user_id')) {
                $table->unsignedBigInteger('user_id')->nullable()->after('cnic');
            }
        });

        Schema::table('hrm_onboardings', function (Blueprint $table) {
            if (!Schema::hasColumn('hrm_onboardings', 'user_id')) {
                $table->unsignedBigInteger('user_id')->nullable()->after('candidate_id');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'criminal_record_file')) {
                $table->string('criminal_record_file')->nullable()->after('other_document');
            }
            if (!Schema::hasColumn('users', 'criminal_check_status')) {
                $table->string('criminal_check_status')->default('Pending')->after('criminal_record_file');
            }
        });
    }

    public function down(): void
    {
        Schema::table('hrm_candidates', function (Blueprint $table) {
            if (Schema::hasColumn('hrm_candidates', 'user_id')) {
                $table->dropColumn(['user_id']);
            }
        });

        Schema::table('hrm_onboardings', function (Blueprint $table) {
            if (Schema::hasColumn('hrm_onboardings', 'user_id')) {
                $table->dropColumn(['user_id']);
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'criminal_record_file')) {
                $table->dropColumn(['criminal_record_file']);
            }
            if (Schema::hasColumn('users', 'criminal_check_status')) {
                $table->dropColumn(['criminal_check_status']);
            }
        });
    }
};
