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

/// match_pairs: all pairs always end up matched (wrong picks stay open for
/// retry), so the outcome reads from HOW MANY tries went wrong on the way.
InteractiveOutcome matchOutcome(int mistakes, int totalPairs) {
  if (mistakes == 0) return InteractiveOutcome.correct;
  return mistakes < totalPairs
      ? InteractiveOutcome.partiallyCorrect
      : InteractiveOutcome.incorrect;
}

/// match_pairs: a deterministic display order for the right column — shuffled
/// away from the pair order (so position never gives the answer away) but
/// stable for the same payload across rebuilds, restores, and tests.
List<int> matchDisplayOrder(int n, String seedSource) {
  var seed = 0;
  for (final c in seedSource.codeUnits) {
    seed = (seed * 31 + c) & 0x7fffffff;
  }
  final order = List<int>.generate(n, (i) => i);
  for (var i = n - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    final j = seed % (i + 1);
    final tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  // If the shuffle landed on the identity (answers aligned row by row),
  // rotate by one so the layout never leaks the mapping.
  var identity = true;
  for (var i = 0; i < n; i++) {
    if (order[i] != i) {
      identity = false;
      break;
    }
  }
  if (identity && n > 1) {
    order.add(order.removeAt(0));
  }
  return order;
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
