<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SystemController extends Controller
{
    /**
     * Health check endpoint.
     * GET /api/v1/health
     * 
     * @OA\Get(
     *     path="/v1/health",
     *     summary="Check system health",
     *     tags={"System"},
     *     @OA\Response(
     *         response=200,
     *         description="System is healthy",
     *         @OA\JsonContent(
     *             @OA\Property(property="name", type="string", example="openmind-backend"),
     *             @OA\Property(property="version", type="string", example="4.0.0"),
     *             @OA\Property(property="uptimeSec", type="integer", example=12345),
     *             @OA\Property(property="db", type="string", example="sqlite"),
     *             @OA\Property(property="llm", type="string", example="mock"),
     *             @OA\Property(property="mockReason", type="string", example="LLM integration pending"),
     *             @OA\Property(property="metrics", type="object", 
     *                 @OA\Property(property="stages", type="array", items=@OA\Items(type="string")),
     *                 @OA\Property(property="escalationRate", type="number", example=0),
     *                 @OA\Property(property="promptCacheHitRate", type="number", example=0),
     *                 @OA\Property(property="estCostPerGameUsd", type="number", example=0)
     *             )
     *         )
     *     )
     * )
     */
    public function health(Request $request)
    {
        $dbStatus = 'down';
        try {
            DB::connection()->getPdo();
            $dbStatus = 'sqlite'; // or 'postgres' depending on config
        } catch (\Exception $e) {
            $dbStatus = 'down';
        }

        return response()->json([
            'name' => 'openmind-backend',
            'version' => '4.0.0',
            'uptimeSec' => (int) (microtime(true) - LARAVEL_START),
            'db' => $dbStatus,
            'sqlite' => 'sqlite',
            'llm' => 'mock',
            'mockReason' => 'LLM integration pending',
            'metrics' => [
                'stages' => [],
                'escalationRate' => 0,
                'promptCacheHitRate' => 0,
                'estCostPerGameUsd' => 0,
            ]
        ]);
    }
}

