<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Student extends Model
{
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'name',
        'gender',
        'grade',
        'language',
        'color',
        'interest',
        'daily_goal',
        'xp',
        'streak_count',
        'streak_last_played_at',
        'token_hash',
    ];

    protected $casts = [
        'streak_last_played_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function games(): HasMany
    {
        return $this->hasMany(Game::class, 'student_id', 'id');
    }

    public function playSessions(): HasMany
    {
        return $this->hasMany(PlaySession::class, 'student_id', 'id');
    }

    public function xpEvents(): HasMany
    {
        return $this->hasMany(XpEvent::class, 'student_id', 'id');
    }

    public function streakEvents(): HasMany
    {
        return $this->hasMany(StreakEvent::class, 'student_id', 'id');
    }
}
