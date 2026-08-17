<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('draft_versions')) {
            Schema::create('draft_versions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('draft_id');
                $table->unsignedInteger('version');
                $table->json('draft_data');
                $table->unsignedBigInteger('edited_by');
                $table->timestamp('edited_at');
                $table->timestamps();

                $table->foreign('draft_id')->references('id')->on('drafts')->cascadeOnDelete();
                $table->foreign('edited_by')->references('id')->on('users')->cascadeOnDelete();
                $table->unique(['draft_id', 'version']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('draft_versions');
    }
};
