/// Pure outcome rules for the tutor's interactive blocks — no widgets, fully
/// unit-testable. The widgets gather the learner's action; these functions
/// decide what it amounted to (the `correctnessOrOutcome` wire value).
library;

import '../tutor_models.dart';

/// number_line: the placed value counts when it lands within the tolerance
/// (defaulting to half a step — "the nearest snap wins").
InteractiveOutcome numberLineOutcome({
  required num value,
  required num target,
  required num step,
  num? tolerance,
}) {
  final tol = tolerance ?? step / 2;
  return (value - target).abs() <= tol + 1e-9
      ? InteractiveOutcome.correct
      : InteractiveOutcome.incorrect;
}

/// order_sequence: how many picked positions match the correct order.
int orderCorrectPositions(List<String> picked, List<String> correct) {
  var n = 0;
  for (var i = 0; i < picked.length && i < correct.length; i++) {
    if (picked[i] == correct[i]) n++;
  }
  return n;
}

InteractiveOutcome orderOutcome(List<String> picked, List<String> correct) {
  final n = orderCorrectPositions(picked, correct);
  if (picked.length == correct.length && n == correct.length) {
    return InteractiveOutcome.correct;
  }
  return n > 0 ? InteractiveOutcome.partiallyCorrect : InteractiveOutcome.incorrect;
}

/// sort_buckets: outcome from the per-item score.
InteractiveOutcome sortOutcome(int correctCount, int total) {
  if (correctCount == total) return InteractiveOutcome.correct;
  return correctCount > 0
      ? InteractiveOutcome.partiallyCorrect
      : InteractiveOutcome.incorrect;
}

/// Human-friendly number: 0.75 stays 0.75, 3.0 becomes 3.
String formatNum(num v) {
  if (v == v.roundToDouble()) return v.round().toString();
  var s = v.toStringAsFixed(2);
  while (s.endsWith('0')) {
    s = s.substring(0, s.length - 1);
  }
  if (s.endsWith('.')) s = s.substring(0, s.length - 1);
  return s;
}
