<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('hrm_esign_templates', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('type')->default('custom');
            $table->string('required_action')->default('sign'); // 'sign' or 'acknowledge'
            $table->longText('content');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hrm_esign_templates');
    }
};
