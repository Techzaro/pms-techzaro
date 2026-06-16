<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Personal info
            if (!Schema::hasColumn('users', 'father_name')) {
                $table->string('father_name')->nullable()->after('name');
            }
            if (!Schema::hasColumn('users', 'id_card_number')) {
                $table->string('id_card_number')->nullable()->after('father_name');
            }
            if (!Schema::hasColumn('users', 'phone_number')) {
                $table->string('phone_number')->nullable()->after('id_card_number');
            }

            // Address
            if (!Schema::hasColumn('users', 'present_address')) {
                $table->text('present_address')->nullable()->after('address');
            }
            if (!Schema::hasColumn('users', 'permanent_address')) {
                $table->text('permanent_address')->nullable()->after('present_address');
            }

            // Emergency contact
            if (!Schema::hasColumn('users', 'emergency_contact_name')) {
                $table->string('emergency_contact_name')->nullable()->after('permanent_address');
            }
            if (!Schema::hasColumn('users', 'emergency_contact_relation')) {
                $table->string('emergency_contact_relation')->nullable()->after('emergency_contact_name');
            }
            if (!Schema::hasColumn('users', 'emergency_contact_phone')) {
                $table->string('emergency_contact_phone')->nullable()->after('emergency_contact_relation');
            }

            // Emails
            if (!Schema::hasColumn('users', 'personal_email')) {
                $table->string('personal_email')->nullable()->after('emergency_contact_phone');
            }
            if (!Schema::hasColumn('users', 'professional_email_password')) {
                $table->string('professional_email_password')->nullable()->after('personal_email');
            }
            if (!Schema::hasColumn('users', 'recovery_email')) {
                $table->string('recovery_email')->nullable()->after('professional_email_password');
            }

            // Employment
            if (!Schema::hasColumn('users', 'hired_for')) {
                $table->string('hired_for')->nullable()->after('recovery_email');
            }
            if (!Schema::hasColumn('users', 'job_started_date')) {
                $table->date('job_started_date')->nullable()->after('hired_for');
            }
            if (!Schema::hasColumn('users', 'job_ended_date')) {
                $table->date('job_ended_date')->nullable()->after('job_started_date');
            }

            // Salary & bank
            if (!Schema::hasColumn('users', 'gross_salary')) {
                $table->decimal('gross_salary', 12, 2)->nullable()->after('job_ended_date');
            }
            if (!Schema::hasColumn('users', 'applied_via')) {
                $table->string('applied_via')->nullable()->after('gross_salary');
            }
            if (!Schema::hasColumn('users', 'bank_name')) {
                $table->string('bank_name')->nullable()->after('applied_via');
            }
            if (!Schema::hasColumn('users', 'bank_account_number')) {
                $table->string('bank_account_number')->nullable()->after('bank_name');
            }
            if (!Schema::hasColumn('users', 'bank_account_title')) {
                $table->string('bank_account_title')->nullable()->after('bank_account_number');
            }

            // Documents (file paths)
            if (!Schema::hasColumn('users', 'employment_contract')) {
                $table->string('employment_contract')->nullable()->after('bank_account_title');
            }
            if (!Schema::hasColumn('users', 'offer_letter')) {
                $table->string('offer_letter')->nullable()->after('employment_contract');
            }
            if (!Schema::hasColumn('users', 'techxaro_regulations')) {
                $table->string('techxaro_regulations')->nullable()->after('offer_letter');
            }
            if (!Schema::hasColumn('users', 'latest_education_cert')) {
                $table->string('latest_education_cert')->nullable()->after('techxaro_regulations');
            }
            if (!Schema::hasColumn('users', 'cv')) {
                $table->string('cv')->nullable()->after('latest_education_cert');
            }
            if (!Schema::hasColumn('users', 'previous_exp_letter')) {
                $table->string('previous_exp_letter')->nullable()->after('cv');
            }
            if (!Schema::hasColumn('users', 'previous_salary_slip')) {
                $table->string('previous_salary_slip')->nullable()->after('previous_exp_letter');
            }
            if (!Schema::hasColumn('users', 'other_document')) {
                $table->string('other_document')->nullable()->after('previous_salary_slip');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $columns = [
                'father_name', 'id_card_number', 'phone_number',
                'present_address', 'permanent_address',
                'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone',
                'personal_email', 'professional_email_password', 'recovery_email',
                'hired_for', 'job_started_date', 'job_ended_date',
                'gross_salary', 'applied_via',
                'bank_name', 'bank_account_number', 'bank_account_title',
                'employment_contract', 'offer_letter', 'techxaro_regulations',
                'latest_education_cert', 'cv', 'previous_exp_letter',
                'previous_salary_slip', 'other_document',
            ];
            foreach ($columns as $col) {
                if (Schema::hasColumn('users', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
