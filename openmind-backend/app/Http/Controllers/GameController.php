<?php

namespace App\Http\Controllers;

use App\Models\Game;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GameController extends Controller
{
    private const THEMES = [
        'quest_path' => ['fantasy', 'sci_fi', 'detective', 'anime'],
        'goal_shootout' => ['football', 'basketball', 'hockey', 'archery'],
        'draw_connect' => ['blueprint', 'notebook', 'whiteboard', 'chalkboard'],
    ];

    /**
     * List games for the authenticated student.
     * GET /api/v1/games/library?limit=50&offset=0
     * 
     * @OA\Get(
     *     path="/v1/games/library",
     *     summary="List student's game library",
     *     tags={"Games"},
     *     security={{"bearerAuth":{}}},
     *     @OA\Parameter(name="limit", in="query", description="Number of items to return", required=false, @OA\Schema(type="integer", default=50)),
     *     @OA\Parameter(name="offset", in="query", description="Offset for pagination", required=false, @OA\Schema(type="integer", default=0)),
     *     @OA\Response(
     *         response=200,
     *         description="Game library retrieved",
     *         @OA\JsonContent(
     *             @OA\Property(property="items", type="array", @OA\Items(
     *                 @OA\Property(property="id", type="string", format="uuid"),
     *                 @OA\Property(property="gameType", type="string"),
     *                 @OA\Property(property="theme", type="string"),
     *                 @OA\Property(property="subject", type="string"),
     *                 @OA\Property(property="topic", type="string"),
     *                 @OA\Property(property="language", type="string"),
     *                 @OA\Property(property="status", type="string"),
     *                 @OA\Property(property="error", type="string", nullable=true),
     *                 @OA\Property(property="shellVersion", type="string"),
     *                 @OA\Property(property="thumbnailUrl", type="string", nullable=true),
     *                 @OA\Property(property="bestScore", type="integer"),
     *                 @OA\Property(property="playCount", type="integer"),
     *                 @OA\Property(property="lastPlayedAt", type="string", format="date-time", nullable=true),
     *                 @OA\Property(property="createdAt", type="string", format="date-time")
     *             )),
     *             @OA\Property(property="total", type="integer"),
     *             @OA\Property(property="limit", type="integer"),
     *             @OA\Property(property="offset", type="integer")
     *         )
     *     ),
     *     @OA\Response(response=401, description="Unauthorized")
     * )
     */
    public function index(Request $request)
    {
        $student = $request->student;

        if (!$student) {
            return response()->json([
                'error' => [
                    'code' => 'UNAUTHORIZED',
                    'message' => 'missing bearer token',
                    'requestId' => $request->id,
                ]
            ], 401);
        }

        $limit = min((int) $request->query('limit', 50), 100);
        $offset = (int) $request->query('offset', 0);

        $query = Game::where('student_id', $student->id)
            ->whereNull('deleted_at')
            ->orderByDesc('last_played_at')
            ->orderByDesc('created_at');

        $total = $query->count();
        $items = $query->offset($offset)->limit($limit)->get();

        return response()->json([
            'items' => $items->map(fn($g) => $this->gameView($g)),
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
        ]);
    }

    /**
     * Create a new game.
     * POST /api/v1/games
     * 
     * @OA\Post(
     *     path="/v1/games",
     *     summary="Create a new game",
     *     tags={"Games"},
     *     security={{"bearerAuth":{}}},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"topic","gameType","theme","sessionLength","difficulty"},
     *             @OA\Property(property="topic", type="string", example="Photosynthesis"),
     *             @OA\Property(property="subject", type="string", example="Biology"),
     *             @OA\Property(property="gameType", type="string", enum={"quest_path","goal_shootout","draw_connect"}, example="quest_path"),
     *             @OA\Property(property="theme", type="string", example="fantasy"),
     *             @OA\Property(property="sessionLength", type="integer", enum={3,5,7}, example=5),
     *             @OA\Property(property="difficulty", type="string", enum={"easy","normal","hard"}, example="normal"),
     *             @OA\Property(property="language", type="string", enum={"en","ar"}, example="en")
     *         )
     *     ),
     *     @OA\Response(
     *         response=201,
     *         description="Game creation initiated",
     *         @OA\JsonContent(
     *             @OA\Property(property="gameId", type="string", format="uuid"),
     *             @OA\Property(property="status", type="string", example="generating"),
     *             @OA\Property(property="clarifyingQuestion", type="string", nullable=true),
     *             @OA\Property(property="stubSpec", type="object")
     *         )
     *     ),
     *     @OA\Response(response=400, description="Bad Request"),
     *     @OA\Response(response=401, description="Unauthorized")
     * )
     */
    public function store(Request $request)
    {
        $student = $request->student;

        if (!$student) {
            return response()->json([
                'error' => [
                    'code' => 'UNAUTHORIZED',
                    'message' => 'missing bearer token',
                    'requestId' => $request->id,
                ]
            ], 401);
        }

        try {
            $validated = $request->validate([
                'topic' => 'required|string',
                'subject' => 'nullable|string',
                'gameType' => 'required|string|in:quest_path,goal_shootout,draw_connect',
                'theme' => 'required|string',
                'sessionLength' => 'required|integer|in:3,5,7',
                'difficulty' => 'required|string|in:easy,normal,hard',
                'language' => 'nullable|string|in:en,ar',
            ]);

            // Validate theme for game type
            if (!in_array($validated['theme'], self::THEMES[$validated['gameType']])) {
                return response()->json([
                    'error' => [
                        'code' => 'THEME_INVALID',
                        'message' => "theme \"{$validated['theme']}\" is not valid for {$validated['gameType']}",
                        'requestId' => $request->id,
                    ]
                ], 400);
            }

            $language = $validated['language'] ?? $student->language;

            // Create the game with generating status
            $game = Game::create([
                'id' => (string) Str::uuid(),
                'student_id' => $student->id,
                'game_type' => $validated['gameType'],
                'theme' => $validated['theme'],
                'subject' => $validated['subject'] ?? 'General',
                'topic' => $validated['topic'],
                'language' => $language,
                'status' => 'generating',
                'error' => null,
                'spec' => null,
                'shell_version' => '',
                'thumbnail_url' => null,
            ]);

            // TODO: Dispatch background job for spec generation
            // GenerateGameSpecJob::dispatch($game, $student, $validated);

            // Build stub spec for progressive start
            $stubSpec = [
                'specVersion' => 1,
                'stub' => true,
                'meta' => [
                    'gameType' => $validated['gameType'],
                    'theme' => $validated['theme'],
                    'subject' => $validated['subject'] ?? 'General',
                    'topic' => $validated['topic'],
                    'language' => $language,
                    'grade' => $student->grade,
                    'difficulty' => $validated['difficulty'],
                    'sessionLength' => $validated['sessionLength'],
                    'numerals' => $language === 'ar' ? 'arabic_indic' : 'western',
                ],
                'student' => [
                    'name' => $student->name,
                    'gender' => $student->gender,
                    'color' => $student->color,
                    'interest' => $student->interest,
                ],
                'levels' => [],
            ];

            return response()->json([
                'gameId' => $game->id,
                'status' => 'generating',
                'clarifyingQuestion' => null,
                'stubSpec' => $stubSpec,
            ], 201);
        } catch (ValidationException $e) {
            return response()->json([
                'error' => [
                    'code' => 'BAD_REQUEST',
                    'message' => $e->errors()[array_key_first($e->errors())][0] ?? 'invalid body',
                    'requestId' => $request->id,
                ]
            ], 400);
        }
    }

    /**
     * Get game status and metadata.
     * GET /api/v1/games/:id
     * 
     * @OA\Get(
     *     path="/v1/games/{id}",
     *     summary="Get game status and metadata",
     *     tags={"Games"},
     *     security={{"bearerAuth":{}}},
     *     @OA\Parameter(name="id", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(
     *         response=200,
     *         description="Game details retrieved",
     *         @OA\JsonContent(
     *             @OA\Property(property="id", type="string", format="uuid"),
     *             @OA\Property(property="gameType", type="string"),
     *             @OA\Property(property="theme", type="string"),
     *             @OA\Property(property="subject", type="string"),
     *             @OA\Property(property="topic", type="string"),
     *             @OA\Property(property="language", type="string"),
     *             @OA\Property(property="status", type="string"),
     *             @OA\Property(property="error", type="string", nullable=true),
     *             @OA\Property(property="shellVersion", type="string"),
     *             @OA\Property(property="thumbnailUrl", type="string", nullable=true),
     *             @OA\Property(property="bestScore", type="integer"),
     *             @OA\Property(property="playCount", type="integer"),
     *             @OA\Property(property="lastPlayedAt", type="string", format="date-time", nullable=true),
     *             @OA\Property(property="createdAt", type="string", format="date-time")
     *         )
     *     ),
     *     @OA\Response(response=404, description="Game not found"),
     *     @OA\Response(response=401, description="Unauthorized")
     * )
     */
    public function show(Request $request, string $id)
    {
        $student = $request->student;

        if (!$student) {
            return response()->json([
                'error' => [
                    'code' => 'UNAUTHORIZED',
                    'message' => 'missing bearer token',
                    'requestId' => $request->id,
                ]
            ], 401);
        }

        $game = Game::where('id', $id)
            ->where('student_id', $student->id)
            ->whereNull('deleted_at')
            ->first();

        if (!$game) {
            return response()->json([
                'error' => [
                    'code' => 'NOT_FOUND',
                    'message' => 'game not found',
                    'requestId' => $request->id,
                ]
            ], 404);
        }

        return response()->json($this->gameView($game));
    }

    /**
     * Update game metadata (best score, played status).
     * PATCH /api/v1/games/:id
     * 
     * @OA\Patch(
     *     path="/v1/games/{id}",
     *     summary="Update game metadata",
     *     tags={"Games"},
     *     security={{"bearerAuth":{}}},
     *     @OA\Parameter(name="id", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\RequestBody(
     *         @OA\JsonContent(
     *             @OA\Property(property="bestScore", type="integer", minimum=0, maximum=100),
     *             @OA\Property(property="played", type="boolean")
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Game updated",
     *         @OA\JsonContent(
     *             @OA\Property(property="id", type="string", format="uuid"),
     *             @OA\Property(property="gameType", type="string"),
     *             @OA\Property(property="theme", type="string"),
     *             @OA\Property(property="subject", type="string"),
     *             @OA\Property(property="topic", type="string"),
     *             @OA\Property(property="language", type="string"),
     *             @OA\Property(property="status", type="string"),
     *             @OA\Property(property="error", type="string", nullable=true),
     *             @OA\Property(property="shellVersion", type="string"),
     *             @OA\Property(property="thumbnailUrl", type="string", nullable=true),
     *             @OA\Property(property="bestScore", type="integer"),
     *             @OA\Property(property="playCount", type="integer"),
     *             @OA\Property(property="lastPlayedAt", type="string", format="date-time", nullable=true),
     *             @OA\Property(property="createdAt", type="string", format="date-time")
     *         )
     *     ),
     *     @OA\Response(response=400, description="Bad Request"),
     *     @OA\Response(response=404, description="Game not found"),
     *     @OA\Response(response=401, description="Unauthorized")
     * )
     */
    public function update(Request $request, string $id)
    {
        $student = $request->student;

        if (!$student) {
            return response()->json([
                'error' => [
                    'code' => 'UNAUTHORIZED',
                    'message' => 'missing bearer token',
                    'requestId' => $request->id,
                ]
            ], 401);
        }

        $game = Game::where('id', $id)
            ->where('student_id', $student->id)
            ->whereNull('deleted_at')
            ->first();

        if (!$game) {
            return response()->json([
                'error' => [
                    'code' => 'NOT_FOUND',
                    'message' => 'game not found',
                    'requestId' => $request->id,
                ]
            ], 404);
        }

        try {
            $validated = $request->validate([
                'bestScore' => 'nullable|integer|min:0|max:100',
                'played' => 'nullable|boolean',
            ]);

            if (isset($validated['bestScore']) && $validated['bestScore'] > $game->best_score) {
                $game->best_score = $validated['bestScore'];
            }

            if ($validated['played'] ?? false) {
                $game->play_count += 1;
                $game->last_played_at = now();
            }

            $game->save();

            return response()->json($this->gameView($game));
        } catch (ValidationException $e) {
            return response()->json([
                'error' => [
                    'code' => 'BAD_REQUEST',
                    'message' => $e->errors()[array_key_first($e->errors())][0] ?? 'invalid body',
                    'requestId' => $request->id,
                ]
            ], 400);
        }
    }

    /**
     * Soft delete a game.
     * DELETE /api/v1/games/:id
     * 
     * @OA\Delete(
     *     path="/v1/games/{id}",
     *     summary="Soft delete a game",
     *     tags={"Games"},
     *     security={{"bearerAuth":{}}},
     *     @OA\Parameter(name="id", in="path", required=true, @OA\Schema(type="string", format="uuid")),
     *     @OA\Response(
     *         response=204,
     *         description="Game deleted"
     *     ),
     *     @OA\Response(response=404, description="Game not found"),
     *     @OA\Response(response=401, description="Unauthorized")
     * )
     */
    public function destroy(Request $request, string $id)
    {
        $student = $request->student;

        if (!$student) {
            return response()->json([
                'error' => [
                    'code' => 'UNAUTHORIZED',
                    'message' => 'missing bearer token',
                    'requestId' => $request->id,
                ]
            ], 401);
        }

        $game = Game::where('id', $id)
            ->where('student_id', $student->id)
            ->whereNull('deleted_at')
            ->first();

        if (!$game) {
            return response()->json([
                'error' => [
                    'code' => 'NOT_FOUND',
                    'message' => 'game not found',
                    'requestId' => $request->id,
                ]
            ], 404);
        }

        $game->delete();

        return response()->noContent();
    }

    /**
     * Format game data for API response.
     */
    private function gameView(Game $game): array
    {
        return [
            'id' => $game->id,
            'gameType' => $game->game_type,
            'theme' => $game->theme,
            'subject' => $game->subject,
            'topic' => $game->topic,
            'language' => $game->language,
            'status' => $game->status,
            'error' => $game->error,
            'shellVersion' => $game->shell_version,
            'thumbnailUrl' => $game->thumbnail_url,
            'bestScore' => $game->best_score,
            'playCount' => $game->play_count,
            'lastPlayedAt' => $game->last_played_at?->toIso8601String(),
            'createdAt' => $game->created_at->toIso8601String(),
        ];
    }
}
