<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SpecCache extends Model
{
    protected $primaryKey = 'key';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'key',
        'content',
        'expires_at',
    ];

    protected $casts = [
        'content' => 'json',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
