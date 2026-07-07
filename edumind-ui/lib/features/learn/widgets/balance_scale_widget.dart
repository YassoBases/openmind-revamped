import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../core/api_client.dart';
import '../../../core/app_theme.dart';
import '../../tutor/blocks/block_logic.dart' show formatNum;
import '../../tutor/tutor_models.dart' show InteractiveOutcome;
import '../../../shared/interactive_tools/balance_scale_core.dart';
import '../../../shared/interactive_tools/linked_views_core.dart';
import '../learn_models.dart';
import 'learn_widget_registry.dart';

/// balance_scale inside a lesson experience — the SAME [BalanceScaleCore]
/// Ask Hudhud uses, but "check" calls the backend's stateless verify route
/// (POST /api/v1/tools/balance_scale/verify) instead of computing locally,
/// so a lesson challenge is graded by the server too, not just client code
/// (unlike triangle_planner, which has no server check at all). A wrong
/// check does not lock the widget — the learner keeps adjusting and
/// rechecking until the beam levels, same spirit as triangle_planner's
/// continuous targetMet.
///
/// params: coefficient, constant, target, min, max, step, unit?, tolerance?
class BalanceScaleWidget extends StatefulWidget {
  const BalanceScaleWidget({super.key, required this.spec, required this.onStatus});

  final LearnWidgetSpec spec;
  final LearnWidgetStatusCallback onStatus;

  @override
  State<BalanceScaleWidget> createState() => _BalanceScaleWidgetState();
}

class _BalanceScaleWidgetState extends State<BalanceScaleWidget> {
  bool _checking = false;
  InteractiveOutcome? _outcome;
  bool _networkError = false;
  num? _liveValue; // current x, for the linked companion views

  /// The step engine's "explore" kind gates on interaction alone, not
  /// correctness — reported the moment x first moves, never delayed behind
  /// the async verify round trip (which only updates targetMet).
  void _onMoved() {
    widget.onStatus(LearnWidgetStatus(
      interacted: true,
      targetMet: _outcome == InteractiveOutcome.correct,
    ));
  }

  num get _coefficient => (widget.spec.params['coefficient'] as num?) ?? 1;
  num get _constant => (widget.spec.params['constant'] as num?) ?? 0;
  num get _target => (widget.spec.params['target'] as num?) ?? 0;
  num get _min => (widget.spec.params['min'] as num?) ?? 0;
  num get _max => (widget.spec.params['max'] as num?) ?? 20;
  num get _step => (widget.spec.params['step'] as num?) ?? 1;
  num? get _tolerance => widget.spec.params['tolerance'] as num?;
  String? get _unit => widget.spec.params['unit'] as String?;

  /// Linked companion views requested by this step (equation/table/graph), or
  /// empty — an ordinary balance with no extra representations.
  List<String> get _views => [
        for (final v in (widget.spec.params['views'] as List? ?? const []))
          v as String,
      ];

  Future<void> _check(num value) async {
    setState(() {
      _checking = true;
      _networkError = false;
    });
    try {
      final res = await Api.verifyTool(
        'balance_scale',
        {
          'coefficient': _coefficient,
          'constant': _constant,
          'target': _target,
          'min': _min,
          'max': _max,
          'step': _step,
          if (_tolerance != null) 'tolerance': _tolerance,
        },
        {'value': value},
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
        detail: 'x=${formatNum(value)}, target=${formatNum(_target)}',
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
      InteractiveOutcome.correct => (l.translate('learn_balance_correct'), AppColors.mutedGreen),
      InteractiveOutcome.incorrect => (l.translate('learn_balance_incorrect'), AppColors.retryYellowInk),
      _ => (null, cs.onSurfaceVariant),
    };

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        BalanceScaleCore(
          coefficient: _coefficient,
          constant: _constant,
          target: _target,
          min: _min,
          max: _max,
          step: _step,
          unit: _unit,
          enabled: true,
          checking: _checking,
          outcome: _outcome,
          onCheck: _check,
          onMoved: _onMoved,
          onValue: _views.isEmpty
              ? null
              : (v) => setState(() => _liveValue = v),
        ),
        if (_views.isNotEmpty && _liveValue != null) ...[
          const SizedBox(height: 10),
          LinkedViewsCore(
            value: _liveValue!,
            coefficient: _coefficient,
            constant: _constant,
            target: _target,
            min: _min,
            max: _max,
            views: _views,
          ),
        ],
        if (_checking) ...[
          const SizedBox(height: 6),
          Text(l.translate('learn_balance_checking'), style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
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
            l.translate('learn_balance_offline'),
            style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant),
          ),
        ],
      ],
    );
  }
}
