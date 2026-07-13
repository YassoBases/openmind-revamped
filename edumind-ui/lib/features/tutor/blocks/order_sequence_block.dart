import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../core/app_theme.dart';
import '../tutor_models.dart';
import 'block_frame.dart';
import 'block_logic.dart';
import 'tutor_block_registry.dart';

/// order_sequence: the learner taps items into a numbered sequence (tap a
/// placed item to take it back), then checks. Each position shows its own
/// consequence (right/wrong) — hint-first, the correct order is never
/// revealed here; the tutor follows up on the result.
class OrderSequenceBlock extends StatefulWidget {
  const OrderSequenceBlock({
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
  State<OrderSequenceBlock> createState() => _OrderSequenceBlockState();
}

class _OrderSequenceBlockState extends State<OrderSequenceBlock> {
  final List<String> _picked = [];
  InteractiveOutcome? _outcome;

  // Correct freezes; a miss keeps the sequence editable for another try while
  // the parent keeps the instance open (same convention as the shared cores).
  bool get _active => widget.enabled && _outcome != InteractiveOutcome.correct;
  InteractiveItem _item(String id) =>
      widget.payload.items.firstWhere((i) => i.id == id);

  /// Any edit after a miss clears the marks — the learner is on a new try.
  void _edit(VoidCallback change) {
    setState(() {
      if (_outcome != null && _outcome != InteractiveOutcome.correct) {
        _outcome = null;
      }
      change();
    });
  }

  void _check() {
    final l = AppLocalizations.of(context)!;
    final p = widget.payload;
    final outcome = orderOutcome(_picked, p.correctOrder);
    final n = orderCorrectPositions(_picked, p.correctOrder);
    setState(() => _outcome = outcome);
    final summary = l
        .translate('ir_order')
        .replaceFirst('{list}', _picked.map((id) => _item(id).label).join(' ← '));
    widget.onResult(
      InteractiveResult(
        blockType: p.type,
        attempted: true,
        answerOrState: summary,
        outcome: outcome,
        answer: {'order': List<String>.of(_picked)},
        learningSignal: '$n/${p.correctOrder.length} positions correct',
      ),
      summary,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final p = widget.payload;
    final remaining = p.items.where((i) => !_picked.contains(i.id)).toList();

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // The sequence built so far, one numbered row per placed item.
          for (var i = 0; i < _picked.length; i++) _placedRow(i, cs),
          if (remaining.isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final item in remaining)
                  OutlinedButton(
                    onPressed:
                        _active ? () => _edit(() => _picked.add(item.id)) : null,
                    style: OutlinedButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppRadii.button),
                      ),
                    ),
                    child: Text(item.label, style: const TextStyle(fontSize: 12.5)),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton.tonal(
              // A re-check requires an edit first (edits clear the marks) —
              // never a same-answer resubmission.
              onPressed: _active && _outcome == null && _picked.length == p.items.length
                  ? _check
                  : null,
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

  Widget _placedRow(int i, ColorScheme cs) {
    final checked = _outcome != null;
    final right = checked && widget.payload.correctOrder[i] == _picked[i];
    final Color border = !checked
        ? cs.outlineVariant
        : right
            ? AppColors.mutedGreen
            : AppColors.retryYellow;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.button),
        onTap: _active ? () => _edit(() => _picked.removeAt(i)) : null,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: cs.surface,
            border: Border.all(color: border, width: checked ? 1.6 : 1),
            borderRadius: BorderRadius.circular(AppRadii.button),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 10,
                backgroundColor: AppColors.blue.withValues(alpha: 0.12),
                child: Text(
                  '${i + 1}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppColors.blue,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _item(_picked[i]).label,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
              ),
              if (checked)
                Icon(
                  right ? Icons.check_rounded : Icons.close_rounded,
                  size: 16,
                  color: right ? AppColors.mutedGreen : AppColors.retryYellowInk,
                )
              else if (_active)
                Icon(Icons.close_rounded, size: 14, color: cs.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}
