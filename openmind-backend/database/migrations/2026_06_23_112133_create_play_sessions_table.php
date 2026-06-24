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
        Schema::create('play_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('game_id')->nullable();
            $table->uuid('student_id');
            $table->jsonb('summary');
            $table->integer('xp')->default(0);
            $table->float('accuracy')->default(0);
            $table->timestamps();

            $table->foreign('game_id')->references('id')->on('games')->onDelete('cascade');
            $table->foreign('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->index(['student_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('play_sessions');
    }
};
