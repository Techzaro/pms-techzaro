<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email_mode', 20)->nullable()->after('email');
            $table->timestamp('personal_email_verified_at')->nullable()->after('personal_email');
            $table->timestamp('professional_email_verified_at')->nullable()->after('professional_email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'email_mode',
                'personal_email_verified_at',
                'professional_email_verified_at',
            ]);
        });
    }
};
