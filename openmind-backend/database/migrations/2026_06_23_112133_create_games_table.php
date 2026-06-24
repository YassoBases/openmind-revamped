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
        Schema::create('games', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('student_id');
            $table->string('game_type');
            $table->string('theme');
            $table->string('subject');
            $table->string('topic');
            $table->string('language');
            $table->string('status')->default('generating');
            $table->text('error')->nullable();
            $table->jsonb('spec')->nullable();
            $table->string('shell_version')->default('');
            $table->string('thumbnail_url')->nullable();
            $table->integer('best_score')->default(0);
            $table->integer('play_count')->default(0);
            $table->timestamp('last_played_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->foreign('student_id')->references('id')->on('students')->onDelete('cascade');
            $table->index(['student_id', 'deleted_at', 'last_played_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('games');
    }
};
