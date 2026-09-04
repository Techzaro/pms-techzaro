<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::connection('mysql_master')->hasTable('organization_sharing_settings')) {
            Schema::connection('mysql_master')->create('organization_sharing_settings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
                $table->boolean('sharing_enabled')->default(true);
                $table->boolean('auto_approve_connections')->default(false);
                $table->integer('max_connections')->default(50);
                $table->json('allowed_resource_types')->nullable()->comment('Which resource types can be shared');
                $table->json('default_permissions')->nullable()->comment('Default permission levels for new shares');
                $table->boolean('require_approval_for_sharing')->default(true);
                $table->integer('default_access_duration_days')->nullable()->comment('Null = no expiry');
                $table->timestamps();

                $table->unique('organization_id');
            });
        }
    }

    public function down(): void
    {
        Schema::connection('mysql_master')->dropIfExists('organization_sharing_settings');
    }
};
