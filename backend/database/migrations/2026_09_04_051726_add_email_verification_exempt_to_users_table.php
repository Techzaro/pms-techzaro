<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'email_verification_exempt')) {
            Schema::table('users', function (Blueprint $table) {
                $table->boolean('email_verification_exempt')->default(false)->after('email_verified_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'email_verification_exempt')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('email_verification_exempt');
            });
        }
    }
};
