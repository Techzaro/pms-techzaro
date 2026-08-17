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
        // 1. Alter hrm_application_types
        // Add columns independently so recovery is safe if an earlier deployment
        // partially applied this MySQL DDL before a foreign-key failure.
        $applicationTypeColumns = [
            'organization_id' => fn (Blueprint $table) => $table->unsignedBigInteger('organization_id')->nullable()->index(),
            'slug'            => fn (Blueprint $table) => $table->string('slug')->nullable(),
            'icon'            => fn (Blueprint $table) => $table->string('icon')->nullable(),
            'category'        => fn (Blueprint $table) => $table->string('category')->nullable(),
            'status'          => fn (Blueprint $table) => $table->string('status')->default('Active'),
            'created_by'      => fn (Blueprint $table) => $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete(),
            'updated_by'      => fn (Blueprint $table) => $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete(),
        ];

        foreach ($applicationTypeColumns as $column => $definition) {
            if (!Schema::hasColumn('hrm_application_types', $column)) {
                Schema::table('hrm_application_types', $definition);
            }
        }

        // 2. Create hrm_application_fields
        Schema::create('hrm_application_fields', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->nullable()->index();
            $table->foreignId('application_type_id')->constrained('hrm_application_types')->onDelete('cascade');
            $table->string('field_label');
            $table->string('field_name');
            $table->string('field_type'); // Text, Number, Date, Dropdown, Textarea, File Upload, Checkbox, Radio
            $table->boolean('is_required')->default(false);
            $table->string('validation_rules')->nullable();
            $table->json('options')->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        // 3. Recreate hrm_member_requests to match new unified structure
        Schema::dropIfExists('hrm_member_requests');
        Schema::create('hrm_member_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->nullable()->index();
            $table->foreignId('employee_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('application_type_id')->constrained('hrm_application_types')->onDelete('cascade');
            $table->string('request_number')->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('priority')->default('Medium');
            $table->string('status')->default('Pending'); // Pending, Approved, Rejected, Returned, Cancelled, Closed
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->onDelete('set null');
            $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamps();
        });

        // 4. Create hrm_member_request_fields (values)
        Schema::create('hrm_member_request_fields', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->nullable()->index();
            $table->foreignId('request_id')->constrained('hrm_member_requests')->onDelete('cascade');
            $table->string('field_name');
            $table->text('field_value')->nullable();
            $table->timestamps();
        });

        // 5. Create hrm_request_histories
        Schema::create('hrm_request_histories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->nullable()->index();
            $table->foreignId('request_id')->constrained('hrm_member_requests')->onDelete('cascade');
            $table->foreignId('performed_by')->nullable()->constrained('users')->onDelete('set null');
            $table->string('action');
            $table->string('old_status')->nullable();
            $table->string('new_status')->nullable();
            $table->text('comments')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hrm_request_histories');
        Schema::dropIfExists('hrm_member_request_fields');
        Schema::dropIfExists('hrm_member_requests');
        Schema::dropIfExists('hrm_application_fields');
        Schema::table('hrm_application_types', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
            $table->dropForeign(['updated_by']);
            $table->dropColumn(['organization_id', 'slug', 'icon', 'category', 'status', 'created_by', 'updated_by']);
        });
    }
};
