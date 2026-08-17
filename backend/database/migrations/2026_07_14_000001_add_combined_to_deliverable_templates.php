<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliverable_templates', function (Blueprint $table) {
            if (!Schema::hasColumn('deliverable_templates', 'combined')) {
                $table->boolean('combined')->default(false);
            }
        });
    }

    public function down(): void
    {
        Schema::table('deliverable_templates', function (Blueprint $table) {
            $table->dropColumn('combined');
        });
    }
};
