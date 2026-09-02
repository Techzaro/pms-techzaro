<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $organizations = DB::connection('mysql_master')
            ->table('organizations')
            ->whereNull('founding_admin_id')
            ->where('deleted_at', null)
            ->get();

        foreach ($organizations as $org) {
            $dbName = $org->database_name;
            if (!$dbName) {
                continue;
            }

            try {
                $escaped = str_replace('`', '``', $dbName);
                $pdo = DB::connection('mysql_master')->getPdo();
                $stmt = $pdo->prepare(
                    "SELECT id FROM `{$escaped}`.`users` WHERE role = 'admin' AND active = 1 ORDER BY created_at ASC LIMIT 1"
                );
                $stmt->execute();
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);

                if ($row && !empty($row['id'])) {
                    DB::connection('mysql_master')
                        ->table('organizations')
                        ->where('id', $org->id)
                        ->update(['founding_admin_id' => $row['id']]);
                }
            } catch (\Throwable $e) {
                \Log::warning("Failed to backfill founding_admin_id for org {$org->id} ({$org->slug}): " . $e->getMessage());
            }
        }
    }

    public function down(): void
    {
        // No reverse — we don't clear founding_admin_id
    }
};
