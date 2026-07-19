import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/app_theme.dart';
import '../../features/tutor/tutor_models.dart' show InteractiveItem, InteractiveOutcome;

/// timeline's manipulative — the learner taps events onto a vertical timeline
/// (tap a placed event to take it back), then checks. Same permutation
/// mechanic as order_sequence (a full-length arrangement of every item), just
/// presented as a connected timeline instead of a plain numbered list.
///
/// Shared by both surfaces: `features/tutor/blocks/timeline_block.dart` (Ask
/// Hudhud, instant local grading, existing tutor pipeline) and
/// `features/learn/widgets/timeline_widget.dart` (lesson experiences, server
/// verify endpoint). Neither reimplements the timeline or the tap mechanic —
/// they only differ in how a completed order gets graded.
///
/// The vertical axis (top = earliest, bottom = latest) needs no LTR/RTL
/// handling of its own; each event's label still flows in the reading
/// direction via ordinary text layout, so the timeline "follows text
/// direction" (INTERACTIVE_PLATFORM.md §2) simply by not fighting Flutter's
/// default Directionality-aware layout — no axis is forced LTR, unlike
/// number_line/balance_scale's numeric-convention exception.
class TimelineCore extends StatefulWidget {
  const TimelineCore({
    super.key,
    required this.items,
    required this.correctOrder,
    required this.enabled,
    required this.checking,
    required this.outcome,
    required this.onCheck,
    this.onMoved,
  });

  final List<InteractiveItem> items;

  /// The instance's true order — used ONLY for post-check per-node coloring
  /// (identical trust model to order_sequence, which already ships this to
  /// the client for its own local grading).
  final List<String> correctOrder;

  final bool enabled;

  /// True while an async check (server verify, lesson surface) is in flight.
  final bool checking;

  /// The last known outcome — freezes interaction once correct; null before
  /// any check or after a wrong one that still allows another try.
  final InteractiveOutcome? outcome;

  /// Fired when the learner taps "check" with the full placed order.
  final void Function(List<String> order) onCheck;

  /// Fired the moment an event is first placed or taken back — BEFORE any
  /// check. Lesson-experience "explore" steps unlock on interaction alone
  /// (no correctness gate), so this must not wait for a check round trip.
  final VoidCallback? onMoved;

  @override
  State<TimelineCore> createState() => TimelineCoreState();
}

class TimelineCoreState extends State<TimelineCore> {
  final List<String> _picked = [];

  /// The last order actually checked — a re-check requires a DIFFERENT
  /// arrangement, never a same-answer resubmission (matches number_line's
  /// "_moved" rule and order_sequence's edit rule).
  List<String>? _lastChecked;

  bool get _active =>
      widget.enabled && !widget.checking && widget.outcome != InteractiveOutcome.correct;

  bool get _changedSinceCheck =>
      _lastChecked == null || !listEquals(_picked, _lastChecked);

  InteractiveItem _item(String id) => widget.items.firstWhere((i) => i.id == id);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final checked = widget.outcome != null;
    final remaining = widget.items.where((i) => !_picked.contains(i.id)).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < _picked.length; i++) _node(i, cs, checked),
        if (remaining.isNotEmpty) ...[
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final item in remaining)
                OutlinedButton(
                  onPressed: _active
                      ? () {
                          setState(() => _picked.add(item.id));
                          widget.onMoved?.call();
                        }
                      : null,
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
            onPressed: _active && _picked.length == widget.items.length && _changedSinceCheck
                ? () {
                    _lastChecked = List<String>.of(_picked);
                    widget.onCheck(List<String>.of(_picked));
                  }
                : null,
            child: widget.checking
                ? const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(l.translate('blk_check'), style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
        ),
      ],
    );
  }

  Widget _node(int i, ColorScheme cs, bool checked) {
    final id = _picked[i];
    final right = checked && widget.correctOrder.length > i && widget.correctOrder[i] == id;
    final isLast = i == _picked.length - 1;
    final dotColor = !checked ? cs.primary : (right ? AppColors.mutedGreen : AppColors.retryYellow);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(shape: BoxShape.circle, color: dotColor),
              ),
              if (!isLast) Expanded(child: Container(width: 2, color: cs.outlineVariant)),
            ],
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: InkWell(
                borderRadius: BorderRadius.circular(AppRadii.button),
                onTap: _active
                    ? () {
                        setState(() => _picked.removeAt(i));
                        widget.onMoved?.call();
                      }
                    : null,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: cs.surface,
                    border: Border.all(color: dotColor.withValues(alpha: checked ? 0.9 : 0.4)),
                    borderRadius: BorderRadius.circular(AppRadii.button),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _item(id).label,
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                        ),
                      ),
                      if (checked)
                        Icon(
                          right ? Icons.check_rounded : Icons.close_rounded,
                          size: 16,
                          color: dotColor,
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
