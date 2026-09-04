<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->unsignedBigInteger('created_by')->nullable()->change();
        });

        $prefix = config('database.connections.mysql.prefix', '');

        try {
            DB::statement("ALTER TABLE `{$prefix}projects` DROP FOREIGN KEY `projects_created_by_foreign`");
        } catch (\Throwable $e) {
            try {
                $constraints = DB::select("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'", ["{$prefix}projects"]);
                foreach ($constraints as $c) {
                    if (str_contains($c->CONSTRAINT_NAME, 'created_by')) {
                        DB::statement("ALTER TABLE `{$prefix}projects` DROP FOREIGN KEY `{$c->CONSTRAINT_NAME}`");
                        break;
                    }
                }
            } catch (\Throwable $e2) {
                // FK may not exist yet
            }
        }

        Schema::table('projects', function (Blueprint $table) {
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->unsignedBigInteger('created_by')->nullable(false)->change();
            $table->foreign('created_by')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
