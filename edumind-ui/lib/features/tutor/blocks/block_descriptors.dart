/// The Dart twin of the backend tool registry (backend/src/tutor/tools/) —
/// pure data + predicates, no widgets, fully unit-testable. Each approved
/// block family declares its expected per-tool version and its render-safety
/// check here, co-located in ONE map instead of switches scattered across
/// models and registry. Eligibility (grade/stage/subject) is SERVER business
/// and is deliberately not mirrored: the client only ever decides "can I
/// render this safely", never "may this learner have it".
library;

import '../tutor_models.dart';

class TutorBlockDescriptor {
  const TutorBlockDescriptor({required this.version, required this.renderable});

  /// Per-tool version — a mismatch invalidates this tool only.
  final int version;

  /// Client-side twin of the server's semantic gate (belt and braces).
  final bool Function(InteractivePayload p) renderable;
}

/// Shared render-safety check for the order-permutation mechanic
/// (order_sequence, timeline) — both tools reuse this instead of redeclaring
/// it, so the rule can never drift between them (mirrors validateOrderShape
/// in backend/src/tutor/tools/types.ts).
bool _orderRenderable(InteractivePayload p) =>
    p.items.length >= 3 &&
    p.correctOrder.length == p.items.length &&
    p.items.map((i) => i.id).toSet().containsAll(p.correctOrder) &&
    p.correctOrder.toSet().length == p.correctOrder.length;

final Map<String, TutorBlockDescriptor> kTutorBlockDescriptors = {
  'number_line': TutorBlockDescriptor(
    version: 1,
    renderable: (p) =>
        p.min != null &&
        p.max != null &&
        p.step != null &&
        p.target != null &&
        p.min! < p.max! &&
        p.step! > 0 &&
        p.target! >= p.min! &&
        p.target! <= p.max!,
  ),
  'order_sequence': TutorBlockDescriptor(version: 1, renderable: _orderRenderable),
  'sort_buckets': TutorBlockDescriptor(
    version: 1,
    renderable: (p) =>
        p.buckets.length >= 2 &&
        p.items.length >= 3 &&
        p.items.every((i) => p.buckets.any((b) => b.id == i.bucketId)),
  ),
  'match_pairs': TutorBlockDescriptor(
    version: 1,
    renderable: (p) =>
        p.pairs.length >= 3 &&
        p.pairs.length <= 6 &&
        p.pairs.map((x) => x.id).toSet().length == p.pairs.length &&
        // Duplicate labels on either side would make the match ambiguous.
        p.pairs.map((x) => x.left.trim()).toSet().length == p.pairs.length &&
        p.pairs.map((x) => x.right.trim()).toSet().length == p.pairs.length,
  ),
  'balance_scale': TutorBlockDescriptor(
    version: 1,
    renderable: (p) =>
        p.coefficient != null &&
        p.coefficient != 0 &&
        p.constant != null &&
        p.target != null &&
        p.min != null &&
        p.max != null &&
        p.step != null &&
        p.min! < p.max! &&
        p.step! > 0 &&
        (p.target! - p.constant!) / p.coefficient! >= p.min! &&
        (p.target! - p.constant!) / p.coefficient! <= p.max!,
  ),
  'timeline': TutorBlockDescriptor(version: 1, renderable: _orderRenderable),
};
