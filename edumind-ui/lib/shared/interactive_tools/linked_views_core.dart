import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../features/tutor/blocks/block_logic.dart' show formatNum;

/// Companion representations bound to an adjust_observe tool's live state — the
/// SAME relationship shown as an equation, a value table, and a small graph, so
/// the learner reads one idea across linked views (requirement: linked diagram,
/// table, graph, equation; every interaction exposes a relationship). This is
/// not a graphing engine: a fixed set of read-only strips driven by the current
/// value the manipulative reports.
///
/// Modeled on `coefficient·x + constant` vs `target` (balance_scale). [views]
/// selects which strips show: 'equation', 'table', 'graph'.
class LinkedViewsCore extends StatelessWidget {
  const LinkedViewsCore({
    super.key,
    required this.value,
    required this.coefficient,
    required this.constant,
    required this.target,
    required this.min,
    required this.max,
    required this.views,
  });

  final num value;
  final num coefficient;
  final num constant;
  final num target;
  final num min;
  final num max;
  final List<String> views;

  num get _lhs => coefficient * value + constant;
  bool get _balanced => (_lhs - target).abs() < 1e-9;

  @override
  Widget build(BuildContext context) {
    final strips = <Widget>[
      if (views.contains('equation')) _equationStrip(context),
      if (views.contains('table')) _tableStrip(context),
      if (views.contains('graph')) _graphStrip(context),
    ];
    if (strips.isEmpty) return const SizedBox.shrink();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < strips.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          strips[i],
        ],
      ],
    );
  }

  Widget _box(BuildContext context, Widget child) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(10),
      ),
      child: child,
    );
  }

  /// The equation with the current x substituted, and how the two sides compare.
  Widget _equationStrip(BuildContext context) {
    final rel = _balanced ? '=' : (_lhs < target ? '<' : '>');
    final color = _balanced ? AppColors.mutedGreen : Theme.of(context).colorScheme.onSurfaceVariant;
    return _box(
      context,
      Text(
        '${formatNum(coefficient)}·(${formatNum(value)})'
        '${constant >= 0 ? ' + ${formatNum(constant)}' : ' - ${formatNum(constant.abs())}'}'
        ' = ${formatNum(_lhs)} $rel ${formatNum(target)}',
        textDirection: TextDirection.ltr, // equation notation stays LTR (math convention)
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }

  /// A three-row value table around the current x — the same relation as numbers.
  Widget _tableStrip(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final xs = <num>{
      value,
      (value - 1).clamp(min, max),
      (value + 1).clamp(min, max),
    }.toList()
      ..sort();
    TableRow row(String a, String b, {bool header = false, bool highlight = false}) => TableRow(
          decoration: highlight
              ? BoxDecoration(color: cs.primary.withValues(alpha: 0.12))
              : null,
          children: [
            for (final t in [a, b])
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                child: Text(
                  t,
                  textAlign: TextAlign.center,
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: header ? FontWeight.w800 : FontWeight.w600,
                    color: header ? cs.onSurfaceVariant : cs.onSurface,
                  ),
                ),
              ),
          ],
        );
    return _box(
      context,
      Table(
        border: TableBorder.symmetric(
          inside: BorderSide(color: cs.outlineVariant, width: 0.5),
        ),
        children: [
          row('x', '${formatNum(coefficient)}·x'
              '${constant >= 0 ? '+${formatNum(constant)}' : '−${formatNum(constant.abs())}'}',
              header: true),
          for (final x in xs)
            row(formatNum(x), formatNum(coefficient * x + constant), highlight: x == value),
        ],
      ),
    );
  }

  /// A minimal line of y = coefficient·x + constant with the current point and
  /// the target level marked — the relation seen as a graph, not an engine.
  Widget _graphStrip(BuildContext context) {
    return _box(
      context,
      SizedBox(
        height: 90,
        width: double.infinity,
        child: CustomPaint(
          painter: _LinePainter(
            coefficient: coefficient,
            constant: constant,
            target: target,
            min: min,
            max: max,
            value: value,
            accent: Theme.of(context).colorScheme.primary,
            grid: Theme.of(context).colorScheme.outlineVariant,
            point: _balanced ? AppColors.mutedGreen : Theme.of(context).colorScheme.primary,
          ),
        ),
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({
    required this.coefficient,
    required this.constant,
    required this.target,
    required this.min,
    required this.max,
    required this.value,
    required this.accent,
    required this.grid,
    required this.point,
  });

  final num coefficient, constant, target, min, max, value;
  final Color accent, grid, point;

  @override
  void paint(Canvas canvas, Size size) {
    final ys = [
      coefficient * min + constant,
      coefficient * max + constant,
      target,
    ];
    final yMin = ys.reduce((a, b) => a < b ? a : b).toDouble();
    final yMax = ys.reduce((a, b) => a > b ? a : b).toDouble();
    final ySpan = (yMax - yMin).abs() < 1e-9 ? 1.0 : (yMax - yMin);
    final xSpan = (max - min).abs() < 1e-9 ? 1.0 : (max - min).toDouble();

    Offset toPx(num x, num y) => Offset(
          (x - min) / xSpan * size.width,
          size.height - (y - yMin) / ySpan * size.height,
        );

    // Target level.
    final tPaint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    final ty = toPx(min, target).dy;
    canvas.drawLine(Offset(0, ty), Offset(size.width, ty), tPaint);

    // The line y = a·x + b.
    final linePaint = Paint()
      ..color = accent
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    canvas.drawLine(
      toPx(min, coefficient * min + constant),
      toPx(max, coefficient * max + constant),
      linePaint,
    );

    // The current point.
    canvas.drawCircle(
      toPx(value, coefficient * value + constant),
      4,
      Paint()..color = point,
    );
  }

  @override
  bool shouldRepaint(_LinePainter old) =>
      old.value != value || old.coefficient != coefficient || old.constant != constant || old.target != target;
}
