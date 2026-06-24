<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Game extends Model
{
    use SoftDeletes;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'student_id',
        'game_type',
        'theme',
        'subject',
        'topic',
        'language',
        'status',
        'error',
        'spec',
        'shell_version',
        'thumbnail_url',
        'best_score',
        'play_count',
        'last_played_at',
    ];

    protected $casts = [
        'spec' => 'json',
        'last_played_at' => 'datetime',
        'deleted_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'student_id', 'id');
    }

    public function playSessions(): HasMany
    {
        return $this->hasMany(PlaySession::class, 'game_id', 'id');
    }
}
