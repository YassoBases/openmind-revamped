import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../core/app_theme.dart';
import '../tutor_models.dart';
import 'block_frame.dart';
import 'block_logic.dart';
import 'tutor_block_registry.dart';

/// sort_buckets: items arrive one at a time; the learner taps the group each
/// belongs to and sees the consequence immediately (green/red flash naming
/// the truth), then the next item comes. The full score goes to the tutor,
/// with the misplaced items as the learning signal.
class SortBucketsBlock extends StatefulWidget {
  const SortBucketsBlock({
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
  State<SortBucketsBlock> createState() => _SortBucketsBlockState();
}

class _SortBucketsBlockState extends State<SortBucketsBlock> {
  int _index = 0;
  int _correct = 0;
  final List<String> _mistakes = [];

  /// Where each item was placed (one tap per item) — the machine-verifiable
  /// submission the backend recomputes the score from.
  final List<Map<String, String>> _placements = [];

  /// Bucket just tapped (flash feedback); null between items.
  String? _flashBucketId;
  bool _flashRight = false;
  Timer? _flashTimer;

  InteractiveOutcome? _outcome;

  bool get _active =>
      widget.enabled && _outcome == null && _flashBucketId == null;

  @override
  void dispose() {
    _flashTimer?.cancel();
    super.dispose();
  }

  void _pick(InteractiveBucket bucket) {
    final item = widget.payload.items[_index];
    final right = item.bucketId == bucket.id;
    setState(() {
      _placements.add({'itemId': item.id, 'bucketId': bucket.id});
      _flashBucketId = bucket.id;
      _flashRight = right;
      if (right) {
        _correct++;
      } else {
        _mistakes.add('${item.label} ← ${bucket.label}');
      }
    });
    _flashTimer = Timer(const Duration(milliseconds: 750), () {
      if (!mounted) return;
      setState(() {
        _flashBucketId = null;
        if (_index + 1 < widget.payload.items.length) {
          _index++;
        } else {
          _finish();
        }
      });
    });
  }

  void _finish() {
    final l = AppLocalizations.of(context)!;
    final p = widget.payload;
    final outcome = sortOutcome(_correct, p.items.length);
    _outcome = outcome; // inside the caller's setState
    final summary = l
        .translate('ir_sort')
        .replaceFirst('{c}', '$_correct')
        .replaceFirst('{m}', '${p.items.length}');
    widget.onResult(
      InteractiveResult(
        blockType: p.type,
        attempted: true,
        answerOrState: summary,
        outcome: outcome,
        answer: {'placements': List<Map<String, String>>.of(_placements)},
        learningSignal: _mistakes.isEmpty ? null : _mistakes.join('، '),
      ),
      summary,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final p = widget.payload;
    final finished = _outcome != null;
    final item = p.items[_index];

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
      sent: finished,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            finished
                ? l
                    .translate('ir_sort')
                    .replaceFirst('{c}', '$_correct')
                    .replaceFirst('{m}', '${p.items.length}')
                : l
                    .translate('blk_item_of')
                    .replaceFirst('{n}', '${_index + 1}')
                    .replaceFirst('{m}', '${p.items.length}'),
            style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant),
          ),
          if (!finished) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: cs.surface,
                border: Border.all(color: cs.outlineVariant),
                borderRadius: BorderRadius.circular(AppRadii.button),
              ),
              child: Center(
                child: Text(
                  item.label,
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final bucket in p.buckets) _bucketButton(bucket, cs),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _bucketButton(InteractiveBucket bucket, ColorScheme cs) {
    final flashing = _flashBucketId == bucket.id;
    final Color? flash = flashing
        ? (_flashRight ? AppColors.mutedGreen : AppColors.mutedRed).withValues(alpha: 0.18)
        : null;
    final Color border =
        flashing ? (_flashRight ? AppColors.mutedGreen : AppColors.mutedRed) : cs.outlineVariant;
    return OutlinedButton.icon(
      onPressed: _active ? () => _pick(bucket) : null,
      style: OutlinedButton.styleFrom(
        backgroundColor: flash,
        side: BorderSide(color: border, width: flashing ? 1.8 : 1),
        visualDensity: VisualDensity.compact,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.button),
        ),
      ),
      icon: flashing
          ? Icon(
              _flashRight ? Icons.check_rounded : Icons.close_rounded,
              size: 15,
              color: _flashRight ? AppColors.mutedGreen : AppColors.mutedRed,
            )
          : const SizedBox.shrink(),
      label: Text(
        bucket.label,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
      ),
    );
  }
}
