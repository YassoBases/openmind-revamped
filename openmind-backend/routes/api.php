<?php

use App\Http\Controllers\GameController;
use App\Http\Controllers\StatController;
use App\Http\Controllers\StudentController;
use App\Http\Controllers\SystemController;
use App\Http\Middleware\AuthenticateToken;
use Illuminate\Support\Facades\Route;

// System endpoints (unauthenticated)
Route::get('/v1/health', [SystemController::class, 'health']);
Route::get('/health', [SystemController::class, 'health']);

// Student endpoints
Route::post('/v1/students', [StudentController::class, 'store']); // Unauthenticated
Route::middleware(AuthenticateToken::class)->group(function () {
    Route::get('/v1/students/me', [StudentController::class, 'show']);
    Route::patch('/v1/students/me', [StudentController::class, 'update']);
});

// Game endpoints (all authenticated)
Route::middleware(AuthenticateToken::class)->group(function () {
    Route::post('/v1/games', [GameController::class, 'store']);
    Route::get('/v1/games/library', [GameController::class, 'index']);
    Route::get('/v1/games/{id}', [GameController::class, 'show']);
    Route::patch('/v1/games/{id}', [GameController::class, 'update']);
    Route::delete('/v1/games/{id}', [GameController::class, 'destroy']);
    
    // Game spec and play endpoints (to be implemented)
    // Route::get('/v1/games/{id}/spec', [GameController::class, 'spec']);
    // Route::get('/v1/games/{id}/play', [GameController::class, 'play']);
    // Route::post('/v1/games/{id}/retry', [GameController::class, 'retry']);
    // Route::post('/v1/games/{id}/refine', [GameController::class, 'refine']);
    // Route::post('/v1/games/{id}/sessions', [SessionController::class, 'storeGameSession']);
});

// Stats endpoints (all authenticated)
Route::middleware(AuthenticateToken::class)->group(function () {
    Route::get('/v1/students/me/stats', [StatController::class, 'show']);
    Route::post('/v1/students/me/streak-check', [StatController::class, 'streakCheck']);
    Route::get('/v1/students/me/xp-events', [StatController::class, 'xpEvents']);
    
    // Review endpoints (to be implemented)
    // Route::get('/v1/review/today', [ReviewController::class, 'today']);
    // Route::post('/v1/review/sessions', [SessionController::class, 'storeReviewSession']);
});
