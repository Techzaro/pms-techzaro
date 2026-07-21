<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_delegations', function (Blueprint $table) {
            $table->boolean('return_to_transferor')->default(true)->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('task_delegations', function (Blueprint $table) {
            $table->dropColumn('return_to_transferor');
        });
    }
};
