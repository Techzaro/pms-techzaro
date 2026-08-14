<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_delegations', function (Blueprint $table) {
            if (!Schema::hasColumn('task_delegations', 'return_to_transferor')) {
                $table->boolean('return_to_transferor')->default(true);
            }
        });
    }

    public function down(): void
    {
        Schema::table('task_delegations', function (Blueprint $table) {
            $table->dropColumn('return_to_transferor');
        });
    }
};
