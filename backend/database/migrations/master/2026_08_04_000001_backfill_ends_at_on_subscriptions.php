<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::connection('mysql_master')->statement("
            UPDATE organization_subscriptions
            SET ends_at = CASE
                WHEN billing_period = 'yearly' THEN DATE_ADD(starts_at, INTERVAL 1 YEAR)
                ELSE DATE_ADD(starts_at, INTERVAL 1 MONTH)
            END
            WHERE ends_at IS NULL AND starts_at IS NOT NULL
        ");
    }

    public function down(): void
    {
        DB::connection('mysql_master')->statement("
            UPDATE organization_subscriptions SET ends_at = NULL WHERE ends_at IS NOT NULL
        ");
    }
};
