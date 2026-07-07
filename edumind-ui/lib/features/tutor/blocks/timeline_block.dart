import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../shared/interactive_tools/timeline_core.dart';
import '../tutor_models.dart';
import 'block_frame.dart';
import 'block_logic.dart';
import 'tutor_block_registry.dart';

/// timeline (Ask Hudhud): the learner taps events onto the shared
/// [TimelineCore] timeline and checks. Grading is instant and local (the
/// backend recomputes it authoritatively from the submitted `answer` when
/// the result reaches tutor/messages — same as order_sequence, which this
/// tool shares its outcome logic with exactly).
class TimelineBlock extends StatefulWidget {
  const TimelineBlock({
    super.key,
    required this.payload,
    required this.enabled,
    required this.answered,
    required this.onResult,
  });

  final InteractivePayload payload;
  final bool enabled;

  /// The result already reached the tutor (restored thread) — render frozen.
  final bool answered;

  final TutorBlockResultCallback onResult;

  @override
  State<TimelineBlock> createState() => _TimelineBlockState();
}

class _TimelineBlockState extends State<TimelineBlock> {
  InteractiveOutcome? _outcome;

  void _check(List<String> order) {
    final l = AppLocalizations.of(context)!;
    final p = widget.payload;
    final outcome = orderOutcome(order, p.correctOrder);
    final n = orderCorrectPositions(order, p.correctOrder);
    setState(() => _outcome = outcome);
    final summary = l.translate('ir_timeline').replaceFirst(
          '{list}',
          order.map((id) => p.items.firstWhere((i) => i.id == id).label).join(' ← '),
        );
    widget.onResult(
      InteractiveResult(
        blockType: p.type,
        attempted: true,
        answerOrState: summary,
        outcome: outcome,
        answer: {'order': order},
        learningSignal: '$n/${p.correctOrder.length} positions correct',
      ),
      summary,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final p = widget.payload;

    if (widget.answered && _outcome == null) {
      return BlockFrame(
        title: p.title,
        instructions: p.instructions,
        child: AnsweredBlockNote(text: l.translate('blk_answered')),
      );
    }

    return BlockFrame(
      title: p.title,
      instructions: p.instructions,
      outcome: _outcome,
      sent: _outcome != null,
      child: TimelineCore(
        items: p.items,
        correctOrder: p.correctOrder,
        enabled: widget.enabled,
        checking: false,
        outcome: _outcome,
        onCheck: _check,
      ),
    );
  }
}
