<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DeactivateExpiredSkipUsers extends Command
{
    protected $signature = 'email:deactivate-expired';
    protected $description = 'Deactivate users whose email verification skip period (7 days) has expired';

    public function handle(): int
    {
        $deactivatedCount = 0;

        $organizations = Organization::whereNotNull('database_name')
            ->where('status', 'active')
            ->get();

        foreach ($organizations as $org) {
            try {
                $dbName = $org->database_name;
                $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

                $connName = 'skip_check_' . $org->id;
                config()->set("database.connections.{$connName}", [
                    'driver'    => 'mysql',
                    'host'      => $org->database_host ?? $masterConfig['host'] ?? '127.0.0.1',
                    'port'      => $org->database_port ?? $masterConfig['port'] ?? 3306,
                    'database'  => $dbName,
                    'username'  => $org->database_username ?? $masterConfig['username'] ?? 'root',
                    'password'  => $org->database_password ?? $masterConfig['password'] ?? '',
                    'charset'   => 'utf8mb4',
                    'collation' => 'utf8mb4_unicode_ci',
                    'prefix'    => '',
                ]);

                DB::purge($connName);
                $conn = DB::connection($connName);

                $users = $conn->table('users')
                    ->where('active', true)
                    ->whereNotNull('email_skip_until')
                    ->where('email_skip_until', '<=', now())
                    ->whereNull('email_verified_at')
                    ->where('email_verification_exempt', false)
                    ->get();

                foreach ($users as $user) {
                    $conn->table('users')
                        ->where('id', $user->id)
                        ->update([
                            'active' => false,
                            'status' => 'Inactive',
                            'updated_at' => now(),
                        ]);

                    $deactivatedCount++;
                }

                DB::purge($connName);
            } catch (\Exception $e) {
                Log::error("Error deactivating expired skip users for org {$org->id}: " . $e->getMessage());
                DB::purge('skip_check_' . $org->id);
            }
        }

        $this->info("Deactivated {$deactivatedCount} users with expired email skip across " . $organizations->count() . " organizations.");
        return Command::SUCCESS;
    }
}
