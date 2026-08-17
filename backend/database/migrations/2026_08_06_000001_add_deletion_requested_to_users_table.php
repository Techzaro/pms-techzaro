<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'deletion_requested')) {
                $table->boolean('deletion_requested')->default(false)->after('active');
            }
            if (!Schema::hasColumn('users', 'deletion_requested_by')) {
                $table->unsignedBigInteger('deletion_requested_by')->nullable()->after('deletion_requested');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'deletion_requested_by')) {
                $table->dropColumn('deletion_requested_by');
            }
            if (Schema::hasColumn('users', 'deletion_requested')) {
                $table->dropColumn('deletion_requested');
            }
        });
    }
};
