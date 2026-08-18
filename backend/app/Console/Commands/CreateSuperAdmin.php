<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class CreateSuperAdmin extends Command
{
    protected $signature = 'super-admin:create
        {--email= : Super-admin email address}
        {--name= : Super-admin display name}
        {--password= : Temporary password}';

    protected $description = 'Create or update an active super-admin account in the master database';

    public function handle(): int
    {
        $email = strtolower(trim((string) ($this->option('email') ?: $this->ask('Email'))));
        $name = trim((string) ($this->option('name') ?: $this->ask('Name', 'TechXaro Super Admin')));
        $password = (string) ($this->option('password') ?: $this->secret('Temporary password'));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('A valid email address is required.');
            return self::FAILURE;
        }

        if (strlen($password) < 12) {
            $this->error('The temporary password must contain at least 12 characters.');
            return self::FAILURE;
        }

        $now = now();
        $existing = DB::connection('mysql_master')
            ->table('super_admin_users')
            ->where('email', $email)
            ->first();

        $values = [
            'name' => $name,
            'password' => Hash::make($password),
            'role' => 'super_admin',
            'active' => true,
            'must_change_password' => true,
            'updated_at' => $now,
        ];

        if ($existing) {
            DB::connection('mysql_master')
                ->table('super_admin_users')
                ->where('id', $existing->id)
                ->update($values);
            $this->info("Super-admin account updated: {$email}");
        } else {
            DB::connection('mysql_master')
                ->table('super_admin_users')
                ->insert($values + ['email' => $email, 'created_at' => $now]);
            $this->info("Super-admin account created: {$email}");
        }

        return self::SUCCESS;
    }
}
