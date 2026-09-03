<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email_verification_code', 6)->nullable()->after('email_mode');
            $table->timestamp('email_verification_expires_at')->nullable()->after('email_verification_code');
            $table->timestamp('email_skip_until')->nullable()->after('email_verification_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['email_verification_code', 'email_verification_expires_at', 'email_skip_until']);
        });
    }
};
