<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // organization_plans: add storage_unit
        Schema::connection('mysql_master')->table('organization_plans', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organization_plans', 'storage_unit')) {
                $table->string('storage_unit', 4)->default('GB')->after('max_storage_gb');
            }
        });

        // organization_subscriptions: add storage_unit
        Schema::connection('mysql_master')->table('organization_subscriptions', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organization_subscriptions', 'storage_unit')) {
                $table->string('storage_unit', 4)->nullable()->after('custom_max_storage_gb');
            }
        });

        // organizations: add storage_unit
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (!Schema::connection('mysql_master')->hasColumn('organizations', 'storage_unit')) {
                $table->string('storage_unit', 4)->nullable()->after('custom_max_storage_gb');
            }
        });

        // organization_trial_settings: add storage_unit
        if (Schema::connection('mysql_master')->hasTable('organization_trial_settings')) {
            Schema::connection('mysql_master')->table('organization_trial_settings', function (Blueprint $table) {
                if (!Schema::connection('mysql_master')->hasColumn('organization_trial_settings', 'storage_unit')) {
                    $table->string('storage_unit', 4)->default('GB')->after('max_storage_gb');
                }
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organization_plans', function (Blueprint $table) {
            if (Schema::connection('mysql_master')->hasColumn('organization_plans', 'storage_unit')) {
                $table->dropColumn('storage_unit');
            }
        });
        Schema::connection('mysql_master')->table('organization_subscriptions', function (Blueprint $table) {
            if (Schema::connection('mysql_master')->hasColumn('organization_subscriptions', 'storage_unit')) {
                $table->dropColumn('storage_unit');
            }
        });
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (Schema::connection('mysql_master')->hasColumn('organizations', 'storage_unit')) {
                $table->dropColumn('storage_unit');
            }
        });
        if (Schema::connection('mysql_master')->hasTable('organization_trial_settings')) {
            Schema::connection('mysql_master')->table('organization_trial_settings', function (Blueprint $table) {
                if (Schema::connection('mysql_master')->hasColumn('organization_trial_settings', 'storage_unit')) {
                    $table->dropColumn('storage_unit');
                }
            });
        }
    }
};
