import 'package:flutter/material.dart';

import '../tutor_models.dart';
import 'match_pairs_block.dart';
import 'number_line_block.dart';
import 'order_sequence_block.dart';
import 'sort_buckets_block.dart';

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
Widget? buildTutorBlock({
  required InteractivePayload payload,
  required bool enabled,
  required bool answered,
  required TutorBlockResultCallback onResult,
}) {
  return switch (payload.type) {
    'number_line' => NumberLineBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult),
    'order_sequence' => OrderSequenceBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult),
    'sort_buckets' => SortBucketsBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult),
    'match_pairs' => MatchPairsBlock(
        payload: payload, enabled: enabled, answered: answered, onResult: onResult),
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
