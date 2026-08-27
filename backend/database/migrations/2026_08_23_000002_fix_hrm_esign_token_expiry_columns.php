<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('hrm_esign_tokens')) {
            return;
        }

        DB::statement('ALTER TABLE hrm_esign_tokens MODIFY expires_at DATETIME NOT NULL, MODIFY otp_expires_at DATETIME NULL');

        // Restore all still-active tokens to the end of their envelope expiry date.
        DB::statement(<<<'SQL'
            UPDATE hrm_esign_tokens tokens
            INNER JOIN hrm_esign_envelopes envelopes ON envelopes.id = tokens.envelope_id
            SET tokens.expires_at = CONCAT(envelopes.expires_at, ' 23:59:59')
            WHERE tokens.revoked_at IS NULL AND envelopes.completed_at IS NULL AND envelopes.voided_at IS NULL
        SQL);
    }

    public function down(): void
    {
        // Intentionally keep the safe DATETIME representation on rollback.
    }
};
