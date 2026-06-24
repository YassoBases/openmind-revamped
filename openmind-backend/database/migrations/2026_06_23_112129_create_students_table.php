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
        Schema::create('students', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('gender')->nullable();
            $table->integer('grade');
            $table->string('language')->default('en');
            $table->string('color')->default('#58CC02');
            $table->string('interest')->nullable();
            $table->integer('daily_goal')->default(3);
            $table->integer('xp')->default(0);
            $table->integer('streak_count')->default(0);
            $table->timestamp('streak_last_played_at')->nullable();
            $table->string('token_hash')->unique();
            $table->timestamps();
        });

        Schema::table('students', function (Blueprint $table) {
            $table->index(['id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};
