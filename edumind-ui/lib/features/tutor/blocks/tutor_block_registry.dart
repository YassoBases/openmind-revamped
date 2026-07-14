import 'package:flutter/material.dart';

import '../tutor_models.dart';
import 'balance_scale_block.dart';
import 'match_pairs_block.dart';
import 'number_line_block.dart';
import 'order_sequence_block.dart';
import 'sort_buckets_block.dart';
import 'timeline_block.dart';

/// Fires once when the learner finishes acting on a block: the structured
/// [InteractiveResult] plus the human-readable summary that becomes the
/// student's chat message.
typedef TutorBlockResultCallback = void Function(
  InteractiveResult result,
  String summary,
);

/// The controlled widget registry for tutor interactive blocks — the same
/// closed-world doctrine as the lesson engine's learn_widget_registry: the
/// backend validates WHAT may render; this map decides HOW. An unknown type
/// renders nothing (the reply text still stands), so a newer server can ship
/// new blocks without breaking older clients.
///
/// [answered] marks a block whose result already reached the tutor (e.g. a
/// restored thread) — it renders as a calm completed note, never as a live
/// manipulative that could be acted on twice.
///
/// [resetEpoch] bumps when a submission FAILED to reach the server — the
/// block clears its local outcome so the learner can genuinely resubmit
/// (nothing was counted server-side). [acked] is true once the server
/// confirmed receipt — the "sent to your tutor" note renders only then.
/// [priorAttempts] is how many accepted attempts this instance already has
/// (live retries or a restored thread) so the learner can see the budget.
Widget? buildTutorBlock({
  required InteractivePayload payload,
  required bool enabled,
  required bool answered,
  required TutorBlockResultCallback onResult,
  int resetEpoch = 0,
  bool acked = true,
  int priorAttempts = 0,
}) {
  return switch (payload.type) {
    'number_line' => NumberLineBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult,
        resetEpoch: resetEpoch, acked: acked, priorAttempts: priorAttempts),
    'order_sequence' => OrderSequenceBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult,
        resetEpoch: resetEpoch, acked: acked, priorAttempts: priorAttempts),
    'sort_buckets' => SortBucketsBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult,
        resetEpoch: resetEpoch, acked: acked, priorAttempts: priorAttempts),
    'match_pairs' => MatchPairsBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult,
        resetEpoch: resetEpoch, acked: acked, priorAttempts: priorAttempts),
    'balance_scale' => BalanceScaleBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult,
        resetEpoch: resetEpoch, acked: acked, priorAttempts: priorAttempts),
    'timeline' => TimelineBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult,
        resetEpoch: resetEpoch, acked: acked, priorAttempts: priorAttempts),
    _ => null,
  };
}

/// The collapsed body every block shows when [answered] but its live state is
/// gone (restored thread): honest, quiet, no second attempt.
class AnsweredBlockNote extends StatelessWidget {
  const AnsweredBlockNote({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(Icons.check_circle_outline_rounded, size: 16, color: cs.onSurfaceVariant),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}
