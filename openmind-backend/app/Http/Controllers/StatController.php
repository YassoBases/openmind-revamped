<?php

namespace App\Http\Controllers;

use App\Models\PlaySession;
use App\Models\XpEvent;
use Illuminate\Http\Request;

class StatController extends Controller
{
    /**
     * Get student stats.
     * GET /api/v1/students/me/stats
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

        $midnight = now()->startOfDay();
        $today = PlaySession::where('student_id', $student->id)
            ->where('created_at', '>=', $midnight)
            ->get();

        $todayXp = $today->sum('xp');
        $gamesCount = $student->games()->count();

        $league = $this->getLeague($student->xp);

        return response()->json([
            'xp' => $student->xp,
            'streakCount' => $student->streak_count,
            'dailyGoal' => $student->daily_goal,
            'todaySessions' => $today->count(),
            'todayXp' => $todayXp,
            'goalMetToday' => $today->count() >= $student->daily_goal,
            'league' => $league,
            'gamesCount' => $gamesCount,
        ]);
    }

    /**
     * Check if streak is still active.
     * POST /api/v1/students/me/streak-check
     */
    public function streakCheck(Request $request)
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

        $dayMs = 86_400_000;
        $thisDay = (int) (now()->getTimestamp() * 1000 / $dayMs);
        $lastDay = $student->streak_last_played_at
            ? (int) ($student->streak_last_played_at->getTimestamp() * 1000 / $dayMs)
            : null;

        $streakCount = $student->streak_count;
        $lapsed = false;

        if ($lastDay == null || $thisDay - $lastDay > 1) {
            $lapsed = $streakCount > 0;
            $streakCount = 0;
            if ($lapsed) {
                $student->update(['streak_count' => 0]);
            }
        }

        return response()->json([
            'streakCount' => $streakCount,
            'lapsed' => $lapsed,
            'playedToday' => $lastDay === $thisDay,
        ]);
    }

    /**
     * Get XP events for the student.
     * GET /api/v1/students/me/xp-events?limit=50
     */
    public function xpEvents(Request $request)
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

        $limit = min((int) $request->query('limit', 50), 200);

        $events = XpEvent::where('student_id', $student->id)
            ->orderBy('created_at', 'desc')
            ->limit($limit)
            ->get();

        return response()->json([
            'items' => $events->map(fn($e) => [
                'id' => $e->id,
                'amount' => $e->amount,
                'reason' => $e->reason,
                'createdAt' => $e->created_at->toIso8601String(),
            ]),
        ]);
    }

    /**
     * Determine league based on XP.
     */
    private function getLeague(int $xp): string
    {
        if ($xp >= 2000) {
            return 'gold';
        } elseif ($xp >= 500) {
            return 'silver';
        }
        return 'bronze';
    }
}
