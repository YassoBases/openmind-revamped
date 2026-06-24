<?php

namespace App\Services;

use App\Models\Student;
use Illuminate\Support\Str;

class AuthService
{
    /**
     * Generate a new token for a student.
     * Token format: emt_<32 random hex chars>
     */
    public static function generateToken(): array
    {
        $token = 'emt_' . Str::random(64);
        $hash = hash('sha256', $token);
        return [
            'token' => $token,
            'hash' => $hash,
        ];
    }

    /**
     * Hash a token using SHA-256.
     */
    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /**
     * Get student by token hash.
     */
    public static function getStudentByTokenHash(string $hash): ?Student
    {
        return Student::where('token_hash', $hash)->first();
    }
}
