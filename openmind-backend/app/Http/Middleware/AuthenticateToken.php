<?php

namespace App\Http\Middleware;

use App\Services\AuthService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateToken
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization');

        if (!$header || !str_starts_with($header, 'Bearer ')) {
            return response()->json([
                'error' => [
                    'code' => 'UNAUTHORIZED',
                    'message' => 'missing bearer token',
                    'requestId' => $request->id,
                ]
            ], 401);
        }

        $token = substr($header, 7);
        $hash = AuthService::hashToken($token);
        $student = AuthService::getStudentByTokenHash($hash);

        if (!$student) {
            return response()->json([
                'error' => [
                    'code' => 'UNAUTHORIZED',
                    'message' => 'invalid token',
                    'requestId' => $request->id,
                ]
            ], 401);
        }

        $request->merge(['student' => $student]);

        return $next($request);
    }
}
