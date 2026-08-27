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
        Schema::disableForeignKeyConstraints();

        // 3. Drop hrm_workflow_application_types
        Schema::dropIfExists('hrm_workflow_application_types');

        // 3.5. Drop hrm_application_fields
        Schema::dropIfExists('hrm_application_fields');

        // 4. Drop hrm_application_types
        Schema::dropIfExists('hrm_application_types');

        Schema::enableForeignKeyConstraints();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Not implemented for this structural change
    }
};
