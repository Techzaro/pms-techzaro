<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE events MODIFY COLUMN type VARCHAR(64) DEFAULT 'Meeting' NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE events MODIFY COLUMN type VARCHAR(32) DEFAULT 'Meeting' NOT NULL");
    }
};
