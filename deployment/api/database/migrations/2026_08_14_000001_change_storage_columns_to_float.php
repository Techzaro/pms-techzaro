<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // organization_plans: max_storage_gb integer -> float
        Schema::connection('mysql_master')->table('organization_plans', function (Blueprint $table) {
            $table->float('max_storage_gb')->default(5)->change();
        });

        // organization_subscriptions: custom_max_storage_gb integer -> float
        Schema::connection('mysql_master')->table('organization_subscriptions', function (Blueprint $table) {
            $table->float('custom_max_storage_gb')->nullable()->change();
        });

        // organizations: custom_max_storage_gb integer -> float
        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (Schema::connection('mysql_master')->hasColumn('organizations', 'custom_max_storage_gb')) {
                $table->float('custom_max_storage_gb')->nullable()->change();
            }
        });

        // organization_trial_settings: max_storage_gb integer -> float
        if (Schema::connection('mysql_master')->hasTable('organization_trial_settings')) {
            Schema::connection('mysql_master')->table('organization_trial_settings', function (Blueprint $table) {
                if (Schema::connection('mysql_master')->hasColumn('organization_trial_settings', 'max_storage_gb')) {
                    $table->float('max_storage_gb')->default(5)->change();
                }
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->table('organization_plans', function (Blueprint $table) {
            $table->integer('max_storage_gb')->default(5)->change();
        });

        Schema::connection('mysql_master')->table('organization_subscriptions', function (Blueprint $table) {
            $table->integer('custom_max_storage_gb')->nullable()->change();
        });

        Schema::connection('mysql_master')->table('organizations', function (Blueprint $table) {
            if (Schema::connection('mysql_master')->hasColumn('organizations', 'custom_max_storage_gb')) {
                $table->integer('custom_max_storage_gb')->nullable()->change();
            }
        });

        if (Schema::connection('mysql_master')->hasTable('organization_trial_settings')) {
            Schema::connection('mysql_master')->table('organization_trial_settings', function (Blueprint $table) {
                if (Schema::connection('mysql_master')->hasColumn('organization_trial_settings', 'max_storage_gb')) {
                    $table->integer('max_storage_gb')->default(5)->change();
                }
            });
        }
    }
};
