<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('hrm_member_requests')) {
            if (!Schema::hasColumn('hrm_member_requests', 'application_type')) {
                Schema::table('hrm_member_requests', function (Blueprint $table) {
                    $table->string('application_type')->nullable()->after('employee_id')->index();
                });
            }

            if (Schema::hasColumn('hrm_member_requests', 'application_type_id')) {
                Schema::table('hrm_member_requests', function (Blueprint $table) {
                    $table->unsignedBigInteger('application_type_id')->nullable()->change();
                });
            }
        }

        if (Schema::hasTable('hrm_workflows') && !Schema::hasColumn('hrm_workflows', 'application_types')) {
            Schema::table('hrm_workflows', function (Blueprint $table) {
                $table->json('application_types')->nullable()->after('department');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('hrm_workflows') && Schema::hasColumn('hrm_workflows', 'application_types')) {
            Schema::table('hrm_workflows', fn (Blueprint $table) => $table->dropColumn('application_types'));
        }

        if (Schema::hasTable('hrm_member_requests') && Schema::hasColumn('hrm_member_requests', 'application_type')) {
            Schema::table('hrm_member_requests', fn (Blueprint $table) => $table->dropColumn('application_type'));
        }
    }
};
