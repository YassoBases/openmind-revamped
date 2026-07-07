import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/app_theme.dart';
import '../../features/tutor/blocks/block_logic.dart' show formatNum;
import '../../features/tutor/tutor_models.dart' show InteractiveOutcome;

/// balance_scale's manipulative — a beam that tilts toward
/// `coefficient*x + constant` versus `target`, with a slider (and +/- nudge
/// buttons for touch precision, mirroring number_line_block) to move x.
///
/// This widget is the ONE rendering + interaction implementation shared by
/// both surfaces: `features/tutor/blocks/balance_scale_block.dart` (Ask
/// Hudhud, checks locally + submits through the tutor conversation) and
/// `features/learn/widgets/balance_scale_widget.dart` (lesson experiences,
/// checks via the server's stateless verify endpoint). Neither adapter
/// reimplements the beam or the slider — they only differ in what happens
/// when the learner taps "check" and how the outcome flows onward, so grading
/// and rendering can never drift between the two.
class BalanceScaleCore extends StatefulWidget {
  const BalanceScaleCore({
    super.key,
    required this.coefficient,
    required this.constant,
    required this.target,
    required this.min,
    required this.max,
    required this.step,
    this.unit,
    required this.enabled,
    required this.checking,
    required this.outcome,
    required this.onCheck,
    this.onMoved,
    this.onValue,
  });

  final num coefficient;
  final num constant;
  final num target;
  final num min;
  final num max;
  final num step;
  final String? unit;

  /// Whether the slider/check button may currently be used.
  final bool enabled;

  /// True while an async check (server verify, lesson surface) is in flight.
  final bool checking;

  /// The last known outcome — freezes interaction once correct; null before
  /// any check or after a wrong one that still allows another try.
  final InteractiveOutcome? outcome;

  /// Fired when the learner taps "check" with the CURRENT x value. The core
  /// never decides correctness itself — the host does, per its own surface.
  final void Function(num value) onCheck;

  /// Fired the moment x first moves — BEFORE any check. Lesson-experience
  /// "explore" steps unlock on interaction alone (they have no correctness
  /// gate), so this must not wait for a check round trip; optional because
  /// the tutor surface has no use for it (its own "one attempt" flow only
  /// cares about the check).
  final VoidCallback? onMoved;

  /// Fired with the CURRENT x on every change (and once on mount) — drives
  /// linked companion views (equation/table). Optional; surfaces without
  /// linked views (the tutor block) simply don't pass it.
  final ValueChanged<num>? onValue;

  @override
  State<BalanceScaleCore> createState() => BalanceScaleCoreState();
}

class BalanceScaleCoreState extends State<BalanceScaleCore> {
  late double _value;
  bool _moved = false;

  num get _min => widget.min;
  num get _max => widget.max;
  num get _step => widget.step;
  int get _divisions => ((_max - _min) / _step).round().clamp(1, 1000000);

  bool get _active =>
      widget.enabled && !widget.checking && widget.outcome != InteractiveOutcome.correct;

  @override
  void initState() {
    super.initState();
    // Start mid-beam, snapped to the step grid — never on the solution itself.
    final midSteps = (_divisions / 2).floor();
    _value = (_min + midSteps * _step).toDouble();
    // Seed any linked view with the starting value (after first frame so the
    // parent can setState safely).
    if (widget.onValue != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onValue!(_value);
      });
    }
  }

  num get _lhs => widget.coefficient * _value + widget.constant;

  /// -1..1 tilt: negative leans left (lhs < target), positive leans right.
  double get _tilt {
    final diff = (_lhs - widget.target).toDouble();
    final span = (widget.max - widget.min).toDouble();
    if (span == 0) return 0;
    return (diff / span * 4).clamp(-1.0, 1.0);
  }

  void _nudge(int direction) {
    if (!_active) return;
    setState(() {
      _moved = true;
      _value = (_value + direction * _step).clamp(_min.toDouble(), _max.toDouble());
    });
    widget.onMoved?.call();
    widget.onValue?.call(_value);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final settled = widget.outcome == InteractiveOutcome.correct;
    final accent = settled ? AppColors.mutedGreen : cs.primary;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AspectRatio(
          aspectRatio: 2.4,
          child: CustomPaint(
            size: Size.infinite,
            painter: _BeamPainter(tilt: _tilt, accent: accent),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '${formatNum(widget.coefficient)}·x'
          '${widget.constant >= 0 ? ' + ${formatNum(widget.constant)}' : ' - ${formatNum(widget.constant.abs())}'}'
          '  =  ${formatNum(widget.target)}',
          textDirection: TextDirection.ltr, // equation notation stays LTR (math convention)
          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
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
                    ? (v) {
                        setState(() {
                          _moved = true;
                          _value = v;
                        });
                        widget.onMoved?.call();
                        widget.onValue?.call(v);
                      }
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
        Text(
          'x = ${formatNum(_value)}${widget.unit == null ? '' : ' (${widget.unit})'}',
          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton.tonal(
            onPressed: _active && _moved ? () => widget.onCheck(_value) : null,
            child: widget.checking
                ? const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    l.translate('blk_check'),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
          ),
        ),
      ],
    );
  }
}

class _BeamPainter extends CustomPainter {
  _BeamPainter({required this.tilt, required this.accent});

  /// -1..1: negative tilts the beam so the left pan sits lower.
  final double tilt;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.32);
    final beamHalf = size.width * 0.36;
    final angle = tilt * 0.22; // radians, gentle tilt

    final left = center + Offset(-beamHalf, 0).rotate(angle);
    final right = center + Offset(beamHalf, 0).rotate(angle);

    final postPaint = Paint()
      ..color = accent.withValues(alpha: 0.7)
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    // Fulcrum post.
    canvas.drawLine(center, Offset(center.dx, size.height * 0.92), postPaint);
    // Base.
    canvas.drawLine(
      Offset(center.dx - size.width * 0.14, size.height * 0.92),
      Offset(center.dx + size.width * 0.14, size.height * 0.92),
      postPaint,
    );

    final beamPaint = Paint()
      ..color = accent
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(left, right, beamPaint);
    canvas.drawCircle(center, 5, Paint()..color = accent);

    final panPaint = Paint()
      ..color = accent.withValues(alpha: 0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    final panFill = Paint()..color = accent.withValues(alpha: 0.14);
    for (final pan in [left, right]) {
      final rect = Rect.fromCenter(
        center: pan + const Offset(0, 26),
        width: size.width * 0.22,
        height: size.height * 0.16,
      );
      canvas.drawLine(pan, Offset(rect.left, rect.top), panPaint);
      canvas.drawLine(pan, Offset(rect.right, rect.top), panPaint);
      canvas.drawArc(rect, 0, 3.1416, false, panFill..style = PaintingStyle.fill);
      canvas.drawArc(rect, 0, 3.1416, false, panPaint..style = PaintingStyle.stroke);
    }
  }

  @override
  bool shouldRepaint(covariant _BeamPainter old) =>
      old.tilt != tilt || old.accent != accent;
}

extension _RotateOffset on Offset {
  Offset rotate(double radians) {
    final c = math.cos(radians);
    final s = math.sin(radians);
    return Offset(dx * c - dy * s, dx * s + dy * c);
  }
}
