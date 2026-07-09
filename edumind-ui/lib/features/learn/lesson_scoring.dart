/// Pure per-step star scoring — no widgets, fully unit-testable, same
/// doctrine as checkpoint_logic.dart / readiness_logic.dart. A small,
/// learning-focused signal (1-3 stars per step): never a coin economy, a
/// shop, or a leaderboard — just a quick "how well did that go" read that
/// feeds the station-completion summary (see experience_screen._completion).
library;

/// Flat participation star for a pure-narrative scene step — there is
/// nothing to land and no hint ladder applies, so it always earns one star
/// for showing up.
const int kSceneStars = 1;

/// Stars for a step with a real correctness signal (explore, choice,
/// challenge, apply): full marks for a clean, unaided pass; each hint-ladder
/// rung the learner opened costs one star (floor 1 — trying is always worth
/// something); a step not landed still earns the "you tried" star rather
/// than zero, since a wrong pick already taught through its feedback.
int starsFor({required bool correct, int hintRung = 0}) {
  if (!correct) return 1;
  return (3 - hintRung).clamp(1, 3);
}

/// Stars for a `check` step's little quiz, from how many of its items landed
/// — clean sweep earns full marks, a majority earns the middle mark, and
/// anything else still earns the "you tried" star.
int starsForCheck({required int correct, required int total}) {
  if (total <= 0) return 1;
  if (correct == total) return 3;
  if (correct * 2 >= total) return 2;
  return 1;
}
