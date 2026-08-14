<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('event_users')) {
            Schema::create('event_users', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('event_id');
                $table->unsignedBigInteger('user_id');
                $table->timestamps();

                $table->foreign('event_id')->references('id')->on('events')->onDelete('cascade');
                $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
                $table->unique(['event_id', 'user_id']);
            });
        }

        Schema::table('events', function (Blueprint $table) {
            if (! Schema::hasColumn('events', 'is_global')) {
                $table->boolean('is_global')->default(false)->after('all_day');
            }
        });
    }

    public function down()
    {
        Schema::table('events', function (Blueprint $table) {
            if (Schema::hasColumn('events', 'is_global')) {
                $table->dropColumn('is_global');
            }
        });
        Schema::dropIfExists('event_users');
    }
};
