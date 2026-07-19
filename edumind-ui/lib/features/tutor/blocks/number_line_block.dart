import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../tutor_models.dart';
import 'block_frame.dart';
import 'block_logic.dart';
import 'tutor_block_registry.dart';

/// number_line: the learner slides a marker (with fine −/+ steps for touch
/// precision) to place a value, watches the live readout, and checks. The
/// mathematical consequence is immediate; the outcome goes back to the tutor.
class NumberLineBlock extends StatefulWidget {
  const NumberLineBlock({
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

  /// Bumped when a submission failed to reach the server — local outcome
  /// clears so the learner can genuinely resubmit (see tutor_block_registry).
  final int resetEpoch;

  /// True once the server confirmed receipt (drives the "sent" note).
  final bool acked;

  /// Accepted attempts this instance already has (server-counted).
  final int priorAttempts;

  @override
  State<NumberLineBlock> createState() => _NumberLineBlockState();
}

class _NumberLineBlockState extends State<NumberLineBlock> {
  late double _value;
  bool _moved = false;
  InteractiveOutcome? _outcome;

  num get _min => widget.payload.min!;
  num get _max => widget.payload.max!;
  num get _step => widget.payload.step!;
  int get _divisions => ((_max - _min) / _step).round();

  // Correct freezes; a miss keeps the slider live for another try while the
  // parent keeps the instance open (same convention as the shared cores).
  bool get _active => widget.enabled && _outcome != InteractiveOutcome.correct;

  @override
  void initState() {
    super.initState();
    // Start mid-line, snapped to the step grid — never on the target itself.
    final midSteps = (_divisions / 2).floor();
    _value = (_min + midSteps * _step).toDouble();
  }

  @override
  void didUpdateWidget(covariant NumberLineBlock old) {
    super.didUpdateWidget(old);
    // The submission never reached the server — clear the local verdict so
    // the learner can resubmit; nothing was counted against their attempts.
    if (widget.resetEpoch != old.resetEpoch) {
      setState(() {
        _outcome = null;
        _moved = false;
      });
    }
  }

  void _retry() => setState(() {
        _outcome = null;
        _moved = false;
      });

  void _nudge(int direction) {
    if (!_active) return;
    setState(() {
      _moved = true;
      _value = (_value + direction * _step).clamp(_min.toDouble(), _max.toDouble());
    });
  }

  void _check() {
    final l = AppLocalizations.of(context)!;
    final p = widget.payload;
    final outcome = numberLineOutcome(
      value: _value,
      target: p.target!,
      step: _step,
      tolerance: p.tolerance,
    );
    // _moved resets so a retry requires actually moving the marker first —
    // never a same-value resubmission.
    setState(() {
      _outcome = outcome;
      _moved = false;
    });
    final summary = l
        .translate('ir_numberline')
        .replaceFirst('{v}', formatNum(_value))
        .replaceFirst('{t}', formatNum(p.target!));
    widget.onResult(
      InteractiveResult(
        blockType: p.type,
        attempted: true,
        answerOrState: summary,
        outcome: outcome,
        answer: {'value': _value},
      ),
      summary,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
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
      onRetry: widget.enabled && _outcome != null ? _retry : null,
      priorAttempts: widget.priorAttempts,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              IconButton(
                tooltip: '−',
                visualDensity: VisualDensity.compact,
                onPressed: _active ? () => _nudge(-1) : null,
                icon: const Icon(Icons.remove_circle_outline_rounded, size: 20),
              ),
              Expanded(
                child: Slider(
                  value: _value,
                  min: _min.toDouble(),
                  max: _max.toDouble(),
                  divisions: _divisions,
                  onChanged: _active
                      ? (v) => setState(() {
                            _moved = true;
                            _value = v;
                          })
                      : null,
                ),
              ),
              IconButton(
                tooltip: '+',
                visualDensity: VisualDensity.compact,
                onPressed: _active ? () => _nudge(1) : null,
                icon: const Icon(Icons.add_circle_outline_rounded, size: 20),
              ),
            ],
          ),
          Row(
            children: [
              Text(formatNum(_min), style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
              Expanded(
                child: Center(
                  child: Text(
                    '${l.translate('blk_your_value')}: ${formatNum(_value)}'
                    '${p.unit == null ? '' : ' (${p.unit})'}',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              Text(formatNum(_max), style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton.tonal(
              onPressed: _active && _moved ? _check : null,
              child: Text(
                l.translate('blk_check'),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
