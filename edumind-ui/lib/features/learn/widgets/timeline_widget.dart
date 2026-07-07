import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../core/api_client.dart';
import '../../../core/app_theme.dart';
import '../../tutor/tutor_models.dart' show InteractiveItem, InteractiveOutcome;
import '../../../shared/interactive_tools/timeline_core.dart';
import '../learn_models.dart';
import 'learn_widget_registry.dart';

/// timeline inside a lesson experience — the SAME [TimelineCore] Ask Hudhud
/// uses, but "check" calls the backend's stateless verify route
/// (POST /api/v1/tools/timeline/verify) instead of computing locally, so a
/// lesson challenge is graded by the server too. A wrong check does not lock
/// the widget — the learner keeps rearranging and rechecking until the order
/// is correct.
///
/// params: items[{id, label}] (3-8), correctOrder[id,...] (all item ids,
/// earliest to latest — the date/era lives inside each label's text).
class TimelineWidget extends StatefulWidget {
  const TimelineWidget({super.key, required this.spec, required this.onStatus});

  final LearnWidgetSpec spec;
  final LearnWidgetStatusCallback onStatus;

  @override
  State<TimelineWidget> createState() => _TimelineWidgetState();
}

class _TimelineWidgetState extends State<TimelineWidget> {
  bool _checking = false;
  InteractiveOutcome? _outcome;
  bool _networkError = false;

  /// The step engine's "explore" kind gates on interaction alone, not
  /// correctness — reported the moment an event is first placed or taken
  /// back, never delayed behind the async verify round trip (which only
  /// updates targetMet).
  void _onMoved() {
    widget.onStatus(LearnWidgetStatus(
      interacted: true,
      targetMet: _outcome == InteractiveOutcome.correct,
    ));
  }

  List<InteractiveItem> get _items => [
        for (final raw in (widget.spec.params['items'] as List? ?? const []))
          InteractiveItem(
            id: (raw as Map)['id'] as String,
            label: raw['label'] as String,
          ),
      ];

  List<String> get _correctOrder =>
      [for (final id in (widget.spec.params['correctOrder'] as List? ?? const [])) id as String];

  Future<void> _check(List<String> order) async {
    setState(() {
      _checking = true;
      _networkError = false;
    });
    try {
      final res = await Api.verifyTool(
        'timeline',
        {
          'items': [
            for (final item in _items) {'id': item.id, 'label': item.label, 'bucketId': null},
          ],
          'correctOrder': _correctOrder,
        },
        {'order': order},
      );
      final verdict = res['verdict'] as String?;
      final outcome = verdict == 'correct' ? InteractiveOutcome.correct : InteractiveOutcome.incorrect;
      if (!mounted) return;
      setState(() {
        _checking = false;
        _outcome = outcome;
      });
      widget.onStatus(LearnWidgetStatus(
        interacted: true,
        targetMet: outcome == InteractiveOutcome.correct,
        detail: 'order=${order.join(",")}',
      ));
    } catch (_) {
      // Offline/server hiccup — never crash the lesson; let the learner retry.
      if (!mounted) return;
      setState(() {
        _checking = false;
        _networkError = true;
      });
      widget.onStatus(LearnWidgetStatus(interacted: true, targetMet: false));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;

    final (bannerText, bannerColor) = switch (_outcome) {
      InteractiveOutcome.correct => (l.translate('learn_timeline_correct'), AppColors.mutedGreen),
      InteractiveOutcome.incorrect => (l.translate('learn_timeline_incorrect'), AppColors.retryYellowInk),
      _ => (null, cs.onSurfaceVariant),
    };

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        TimelineCore(
          items: _items,
          correctOrder: _correctOrder,
          enabled: true,
          checking: _checking,
          outcome: _outcome,
          onCheck: _check,
          onMoved: _onMoved,
        ),
        if (_checking) ...[
          const SizedBox(height: 6),
          Text(l.translate('learn_timeline_checking'), style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        ] else if (bannerText != null) ...[
          const SizedBox(height: 6),
          Text(
            bannerText,
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: bannerColor),
          ),
        ],
        if (_networkError) ...[
          const SizedBox(height: 4),
          Text(
            l.translate('learn_timeline_offline'),
            style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant),
          ),
        ],
      ],
    );
  }
}
