<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hrm_offer_letters', function (Blueprint $table) {
            $table->string('signature_name')->nullable()->after('status');
            $table->string('signed_ip')->nullable()->after('signature_name');
            $table->string('signed_at')->nullable()->after('signed_ip');
            $table->text('discussion_notes')->nullable()->after('signed_at');
            $table->text('rejection_reason')->nullable()->after('discussion_notes');
            $table->string('access_token')->nullable()->after('rejection_reason');
        });
    }

    public function down(): void
    {
        Schema::table('hrm_offer_letters', function (Blueprint $table) {
            $table->dropColumn(['signature_name', 'signed_ip', 'signed_at', 'discussion_notes', 'rejection_reason', 'access_token']);
        });
    }
};
