<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('shared_resources', 'resource_name')) {
            Schema::table('shared_resources', function (Blueprint $table) {
                $table->string('resource_name', 255)->nullable()->after('resource_id');
            });
        }

        if (!Schema::hasColumn('shared_resources', 'parent_resource_id')) {
            Schema::table('shared_resources', function (Blueprint $table) {
                $table->unsignedBigInteger('parent_resource_id')->nullable()->after('resource_name');
                $table->index('parent_resource_id');
            });
        }
    }

    public function down(): void
    {
        Schema::table('shared_resources', function (Blueprint $table) {
            if (Schema::hasColumn('shared_resources', 'parent_resource_id')) {
                $table->dropIndex(['parent_resource_id']);
                $table->dropColumn('parent_resource_id');
            }
            if (Schema::hasColumn('shared_resources', 'resource_name')) {
                $table->dropColumn('resource_name');
            }
        });
    }
};
