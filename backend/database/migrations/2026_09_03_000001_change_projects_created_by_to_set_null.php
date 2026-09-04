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

        // Drop old CASCADE foreign key and add new SET NULL one
        $table = DB::getDoctrineSchemaManager()->listTableDetails('projects');
        $prefix = config('database.connections.mysql.prefix', '');

        // Try to drop the old foreign key
        try {
            DB::statement("ALTER TABLE `{$prefix}projects` DROP FOREIGN KEY `projects_created_by_foreign`");
        } catch (\Throwable $e) {
            // FK name might be different, try to find and drop it
            try {
                $constraints = DB::select("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{$prefix}projects' AND CONSTRAINT_TYPE = 'FOREIGN KEY'");
                foreach ($constraints as $c) {
                    if ($c->CONSTRAINT_NAME === 'projects_created_by_foreign') {
                        DB::statement("ALTER TABLE `{$prefix}projects` DROP FOREIGN KEY `{$c->CONSTRAINT_NAME}`");
                        break;
                    }
                }
            } catch (\Throwable $e2) {
                // FK may not exist yet
            }
        }

        // Add new foreign key with SET NULL
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
