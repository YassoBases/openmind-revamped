<?php

namespace App\Http\Controllers;

use App\Models\Student;
use App\Services\AuthService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class StudentController extends Controller
{
    /**
     * Store a newly created student (onboarding).
     * POST /api/v1/students
     * 
     * @OA\Post(
     *     path="/v1/students",
     *     summary="Create a new student profile",
     *     tags={"Students"},
     *     @OA\RequestBody(
     *         required=true,
     *         @OA\JsonContent(
     *             required={"name","grade"},
     *             @OA\Property(property="name", type="string", example="John Doe", minLength=1, maxLength=24),
     *             @OA\Property(property="grade", type="integer", example=3, minimum=1, maximum=6),
     *             @OA\Property(property="language", type="string", enum={"en","ar"}, example="en"),
     *             @OA\Property(property="color", type="string", example="#58CC02", pattern="^#[0-9A-Fa-f]{6}$"),
     *             @OA\Property(property="interest", type="string", enum={"dinosaurs","space","football","cats","robots","ocean","cars","royalty","art","music"}, example="space"),
     *             @OA\Property(property="gender", type="string", enum={"m","f"}, example="m"),
     *             @OA\Property(property="dailyGoal", type="integer", enum={1,3,5}, example=3)
     *         )
     *     ),
     *     @OA\Response(
     *         response=201,
     *         description="Student created successfully",
     *         @OA\JsonContent(
     *             @OA\Property(property="studentId", type="string", format="uuid", example="550e8400-e29b-41d4-a716-446655440000"),
     *             @OA\Property(property="token", type="string", example="random_bearer_token"),
     *             @OA\Property(property="student", type="object",
     *                 @OA\Property(property="id", type="string", format="uuid"),
     *                 @OA\Property(property="name", type="string"),
     *                 @OA\Property(property="gender", type="string"),
     *                 @OA\Property(property="grade", type="integer"),
     *                 @OA\Property(property="language", type="string"),
     *                 @OA\Property(property="color", type="string"),
     *                 @OA\Property(property="interest", type="string"),
     *                 @OA\Property(property="dailyGoal", type="integer"),
     *                 @OA\Property(property="xp", type="integer"),
     *                 @OA\Property(property="streakCount", type="integer")
     *             )
     *         )
     *     ),
     *     @OA\Response(response=400, description="Bad Request")
     * )
     */
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'name' => 'required|string|min:1|max:24',
                'grade' => 'required|integer|min:1|max:6',
                'language' => 'nullable|string|in:en,ar',
                'color' => 'nullable|string|regex:/^#[0-9A-Fa-f]{6}$/',
                'interest' => 'nullable|string|in:dinosaurs,space,football,cats,robots,ocean,cars,royalty,art,music',
                'gender' => 'nullable|string|in:m,f',
                'dailyGoal' => 'nullable|integer|in:1,3,5',
            ]);

            $tokenData = AuthService::generateToken();

            $student = Student::create([
                'id' => (string) Str::uuid(),
                'name' => $validated['name'],
                'grade' => $validated['grade'],
                'language' => $validated['language'] ?? 'en',
                'color' => $validated['color'] ?? '#58CC02',
                'interest' => $validated['interest'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'daily_goal' => $validated['dailyGoal'] ?? 3,
                'token_hash' => $tokenData['hash'],
            ]);

            return response()->json([
                'studentId' => $student->id,
                'token' => $tokenData['token'],
                'student' => $this->studentView($student),
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
     * Display the authenticated student's profile.
     * GET /api/v1/students/me
     * 
     * @OA\Get(
     *     path="/v1/students/me",
     *     summary="Get current student profile",
     *     tags={"Students"},
     *     security={{"bearerAuth":{}}},
     *     @OA\Response(
     *         response=200,
     *         description="Student profile retrieved",
     *         @OA\JsonContent(
     *             @OA\Property(property="id", type="string", format="uuid"),
     *             @OA\Property(property="name", type="string"),
     *             @OA\Property(property="gender", type="string"),
     *             @OA\Property(property="grade", type="integer"),
     *             @OA\Property(property="language", type="string"),
     *             @OA\Property(property="color", type="string"),
     *             @OA\Property(property="interest", type="string"),
     *             @OA\Property(property="dailyGoal", type="integer"),
     *             @OA\Property(property="xp", type="integer"),
     *             @OA\Property(property="streakCount", type="integer")
     *         )
     *     ),
     *     @OA\Response(response=401, description="Unauthorized")
     * )
     */
    public function show(Request $request)
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

        return response()->json($this->studentView($student));
    }

    /**
     * Update the authenticated student's profile.
     * PATCH /api/v1/students/me
     * 
     * @OA\Patch(
     *     path="/v1/students/me",
     *     summary="Update current student profile",
     *     tags={"Students"},
     *     security={{"bearerAuth":{}}},
     *     @OA\RequestBody(
     *         @OA\JsonContent(
     *             @OA\Property(property="name", type="string", minLength=1, maxLength=24),
     *             @OA\Property(property="grade", type="integer", minimum=1, maximum=6),
     *             @OA\Property(property="language", type="string", enum={"en","ar"}),
     *             @OA\Property(property="color", type="string", pattern="^#[0-9A-Fa-f]{6}$"),
     *             @OA\Property(property="interest", type="string", enum={"dinosaurs","space","football","cats","robots","ocean","cars","royalty","art","music"}),
     *             @OA\Property(property="gender", type="string", enum={"m","f"}),
     *             @OA\Property(property="dailyGoal", type="integer", enum={1,3,5})
     *         )
     *     ),
     *     @OA\Response(
     *         response=200,
     *         description="Profile updated",
     *         @OA\JsonContent(
     *             @OA\Property(property="id", type="string", format="uuid"),
     *             @OA\Property(property="name", type="string"),
     *             @OA\Property(property="gender", type="string"),
     *             @OA\Property(property="grade", type="integer"),
     *             @OA\Property(property="language", type="string"),
     *             @OA\Property(property="color", type="string"),
     *             @OA\Property(property="interest", type="string"),
     *             @OA\Property(property="dailyGoal", type="integer"),
     *             @OA\Property(property="xp", type="integer"),
     *             @OA\Property(property="streakCount", type="integer")
     *         )
     *     ),
     *     @OA\Response(response=400, description="Bad Request"),
     *     @OA\Response(response=401, description="Unauthorized")
     * )
     */
    public function update(Request $request)
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
                'name' => 'nullable|string|min:1|max:24',
                'grade' => 'nullable|integer|min:1|max:6',
                'language' => 'nullable|string|in:en,ar',
                'color' => 'nullable|string|regex:/^#[0-9A-Fa-f]{6}$/',
                'interest' => 'nullable|string|in:dinosaurs,space,football,cats,robots,ocean,cars,royalty,art,music',
                'gender' => 'nullable|string|in:m,f',
                'dailyGoal' => 'nullable|integer|in:1,3,5',
            ]);

            $updateData = [];
            if (isset($validated['name'])) $updateData['name'] = $validated['name'];
            if (isset($validated['grade'])) $updateData['grade'] = $validated['grade'];
            if (isset($validated['language'])) $updateData['language'] = $validated['language'];
            if (isset($validated['color'])) $updateData['color'] = $validated['color'];
            if (isset($validated['interest'])) $updateData['interest'] = $validated['interest'];
            if (isset($validated['gender'])) $updateData['gender'] = $validated['gender'];
            if (isset($validated['dailyGoal'])) $updateData['daily_goal'] = $validated['dailyGoal'];

            $student->update($updateData);

            return response()->json($this->studentView($student));
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
     * Format student data for API response.
     */
    private function studentView(Student $student): array
    {
        return [
            'id' => $student->id,
            'name' => $student->name,
            'gender' => $student->gender,
            'grade' => $student->grade,
            'language' => $student->language,
            'color' => $student->color,
            'interest' => $student->interest,
            'dailyGoal' => $student->daily_goal,
            'xp' => $student->xp,
            'streakCount' => $student->streak_count,
        ];
    }
}
