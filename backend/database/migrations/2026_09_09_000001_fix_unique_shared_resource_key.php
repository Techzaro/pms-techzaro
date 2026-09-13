<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Drop old unique key that doesn't include org IDs
        Schema::table('shared_resources', function ($table) {
            $table->dropUnique('unique_shared_resource');
        });

        // Create new unique key that includes both org IDs
        // This allows: A->B project 1 AND B->A project 1 (different directions)
        Schema::table('shared_resources', function ($table) {
            $table->unique(
                ['connection_id', 'resource_type', 'resource_id', 'shared_by_organization_id', 'shared_with_organization_id'],
                'unique_shared_resource'
            );
        });
    }

    public function down(): void
    {
        Schema::table('shared_resources', function ($table) {
            $table->dropUnique('unique_shared_resource');
        });

        Schema::table('shared_resources', function ($table) {
            $table->unique(['connection_id', 'resource_type', 'resource_id'], 'unique_shared_resource');
        });
    }
};
