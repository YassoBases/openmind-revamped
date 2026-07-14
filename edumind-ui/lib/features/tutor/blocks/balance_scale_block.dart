import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../shared/interactive_tools/balance_scale_core.dart';
import '../tutor_models.dart';
import 'block_frame.dart';
import 'block_logic.dart';
import 'tutor_block_registry.dart';

/// balance_scale (Ask Hudhud): the learner moves x on the shared
/// [BalanceScaleCore] beam and checks. Grading is instant and local (the
/// backend recomputes it authoritatively from the submitted `answer` when the
/// result reaches tutor/messages — same as every other tutor block, no call
/// to the lesson-surface verify endpoint from here).
class BalanceScaleBlock extends StatefulWidget {
  const BalanceScaleBlock({
    super.key,
    required this.payload,
    required this.enabled,
    required this.answered,
    required this.onResult,
    this.resetEpoch = 0,
    this.acked = true,
    this.priorAttempts = 0,
  });

  final InteractivePayload payload;
  final bool enabled;

  /// The result already reached the tutor (restored thread) — render frozen.
  final bool answered;

  final TutorBlockResultCallback onResult;

  /// See tutor_block_registry: failed-submit reset / server ack / attempts.
  final int resetEpoch;
  final bool acked;
  final int priorAttempts;

  @override
  State<BalanceScaleBlock> createState() => _BalanceScaleBlockState();
}

class _BalanceScaleBlockState extends State<BalanceScaleBlock> {
  InteractiveOutcome? _outcome;

  @override
  void didUpdateWidget(covariant BalanceScaleBlock old) {
    super.didUpdateWidget(old);
    // Failed submit: clear the local verdict (the core keeps its position).
    if (widget.resetEpoch != old.resetEpoch) {
      setState(() => _outcome = null);
    }
  }

  void _check(num value) {
    final l = AppLocalizations.of(context)!;
    final p = widget.payload;
    final outcome = balanceOutcome(
      value: value,
      coefficient: p.coefficient!,
      constant: p.constant!,
      target: p.target!,
      step: p.step!,
      tolerance: p.tolerance,
    );
    setState(() => _outcome = outcome);
    final summary = l
        .translate('ir_balance')
        .replaceFirst('{v}', formatNum(value))
        .replaceFirst('{t}', formatNum(p.target!));
    widget.onResult(
      InteractiveResult(
        blockType: p.type,
        attempted: true,
        answerOrState: summary,
        outcome: outcome,
        answer: {'value': value},
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
      sent: _outcome != null && widget.acked,
      // Retry = clear the banner; the core (which requires a move before a
      // re-check) stays where the learner left it.
      onRetry: widget.enabled && _outcome != null ? () => setState(() => _outcome = null) : null,
      priorAttempts: widget.priorAttempts,
      child: BalanceScaleCore(
        coefficient: p.coefficient!,
        constant: p.constant!,
        target: p.target!,
        min: p.min!,
        max: p.max!,
        step: p.step!,
        unit: p.unit,
        enabled: widget.enabled,
        checking: false,
        outcome: _outcome,
        onCheck: _check,
      ),
    );
  }
}
