import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../core/palette.dart';
import '../tutor_models.dart';
import 'block_frame.dart';
import 'block_logic.dart';
import 'tutor_block_registry.dart';

/// match_pairs: two columns — the learner taps a prompt on the start side,
/// then its match on the other side. A right pick locks green immediately, a
/// wrong pick flashes red and stays open for retry (the mistake is counted
/// and becomes the learning signal). Tap-only, follows text direction.
class MatchPairsBlock extends StatefulWidget {
  const MatchPairsBlock({
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
  State<MatchPairsBlock> createState() => _MatchPairsBlockState();
}

class _MatchPairsBlockState extends State<MatchPairsBlock> {
  /// Pair id currently selected on the left, if any.
  String? _selectedId;

  /// Pair ids already matched (locked).
  final Set<String> _matched = {};

  int _mistakes = 0;
  final List<String> _wrongTries = [];

  /// Pair id whose RIGHT button is flashing red; null otherwise.
  String? _flashWrongId;
  Timer? _flashTimer;

  InteractiveOutcome? _outcome;

  /// Right-column display order — deterministic per payload, never aligned.
  late final List<int> _rightOrder = matchDisplayOrder(
    widget.payload.pairs.length,
    widget.payload.pairs.map((p) => p.id).join('|'),
  );

  bool get _active => widget.enabled && _outcome == null && _flashWrongId == null;

  @override
  void dispose() {
    _flashTimer?.cancel();
    super.dispose();
  }

  void _pickLeft(InteractivePair pair) {
    setState(() => _selectedId = _selectedId == pair.id ? null : pair.id);
  }

  void _pickRight(InteractivePair pair) {
    final selected = _selectedId;
    if (selected == null) return;
    if (selected == pair.id) {
      setState(() {
        _matched.add(pair.id);
        _selectedId = null;
        if (_matched.length == widget.payload.pairs.length) _finish();
      });
      return;
    }
    final picked = widget.payload.pairs.firstWhere((p) => p.id == selected);
    setState(() {
      _mistakes++;
      _wrongTries.add('${picked.left} ← ${pair.right}');
      _flashWrongId = pair.id;
    });
    _flashTimer = Timer(const Duration(milliseconds: 650), () {
      if (!mounted) return;
      setState(() => _flashWrongId = null);
    });
  }

  void _finish() {
    final l = AppLocalizations.of(context)!;
    final p = widget.payload;
    final outcome = matchOutcome(_mistakes, p.pairs.length);
    _outcome = outcome; // inside the caller's setState
    final summary = l
        .translate('ir_match')
        .replaceFirst('{m}', '${p.pairs.length}')
        .replaceFirst('{c}', '$_mistakes');
    widget.onResult(
      InteractiveResult(
        blockType: p.type,
        attempted: true,
        answerOrState: summary,
        outcome: outcome,
        answer: {'wrongTries': _mistakes},
        learningSignal: _wrongTries.isEmpty ? null : _wrongTries.join('، '),
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
                    .translate('ir_match')
                    .replaceFirst('{m}', '${p.pairs.length}')
                    .replaceFirst('{c}', '$_mistakes')
                : l
                    .translate('blk_pair_of')
                    .replaceFirst('{n}', '${_matched.length}')
                    .replaceFirst('{m}', '${p.pairs.length}'),
            style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant),
          ),
          if (!finished) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    children: [
                      for (final pair in p.pairs)
                        _leftButton(pair, cs),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    children: [
                      for (final i in _rightOrder)
                        _rightButton(p.pairs[i], cs),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _leftButton(InteractivePair pair, ColorScheme cs) {
    final matched = _matched.contains(pair.id);
    final selected = _selectedId == pair.id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          onPressed: _active && !matched ? () => _pickLeft(pair) : null,
          style: OutlinedButton.styleFrom(
            backgroundColor: matched
                ? Palette.green.withValues(alpha: 0.12)
                : selected
                    ? cs.primary.withValues(alpha: 0.12)
                    : null,
            side: BorderSide(
              color: matched
                  ? Palette.green
                  : selected
                      ? cs.primary
                      : cs.outlineVariant,
              width: selected || matched ? 1.8 : 1,
            ),
            visualDensity: VisualDensity.compact,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(Palette.radiusButton),
            ),
          ),
          child: Text(
            pair.left,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: matched ? Palette.greenShadow : null,
            ),
          ),
        ),
      ),
    );
  }

  Widget _rightButton(InteractivePair pair, ColorScheme cs) {
    final matched = _matched.contains(pair.id);
    final flashing = _flashWrongId == pair.id;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          onPressed: _active && !matched && _selectedId != null
              ? () => _pickRight(pair)
              : null,
          style: OutlinedButton.styleFrom(
            backgroundColor: matched
                ? Palette.green.withValues(alpha: 0.12)
                : flashing
                    ? Palette.heart.withValues(alpha: 0.18)
                    : null,
            side: BorderSide(
              color: matched
                  ? Palette.green
                  : flashing
                      ? Palette.heart
                      : cs.outlineVariant,
              width: matched || flashing ? 1.8 : 1,
            ),
            visualDensity: VisualDensity.compact,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(Palette.radiusButton),
            ),
          ),
          child: Text(
            pair.right,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: matched ? Palette.greenShadow : null,
            ),
          ),
        ),
      ),
    );
  }
}
