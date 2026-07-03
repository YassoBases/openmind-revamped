import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/palette.dart';
import '../learn_models.dart';
import 'learn_widget_registry.dart';

/// A draggable right triangle on a grid — the manipulative behind the
/// triangle-area experiences. The student drags two handles to reshape the
/// plot and watches the live area readout; with `targetArea` set it turns
/// green (and reports targetMet) when the student lands exactly on it.
///
/// params:
///  base, height   starting dimensions (grid units)
///  maxDim         grid size (default 12)
///  unit           unit label, e.g. "م" — shown as م and م²
///  draggable      false renders a fixed diagram (apply steps)
///  targetArea     challenge goal, optional
class TrianglePlanner extends StatefulWidget {
  const TrianglePlanner({super.key, required this.spec, required this.onStatus});

  final LearnWidgetSpec spec;
  final LearnWidgetStatusCallback onStatus;

  @override
  State<TrianglePlanner> createState() => _TrianglePlannerState();
}

class _TrianglePlannerState extends State<TrianglePlanner> {
  late int _base;
  late int _height;
  bool _interacted = false;

  // Which handle a pan is holding: 'base', 'height', or null.
  String? _dragging;

  int get _maxDim => ((widget.spec.params['maxDim'] as num?) ?? 12).toInt();
  String get _unit => (widget.spec.params['unit'] as String?) ?? '';
  bool get _draggable => (widget.spec.params['draggable'] as bool?) ?? true;
  num? get _targetArea => widget.spec.params['targetArea'] as num?;

  num get _area {
    final doubled = _base * _height;
    return doubled.isEven ? doubled ~/ 2 : doubled / 2;
  }

  bool get _targetMet => _targetArea != null && _area == _targetArea;

  @override
  void initState() {
    super.initState();
    _base = ((widget.spec.params['base'] as num?) ?? 6).toInt();
    _height = ((widget.spec.params['height'] as num?) ?? 4).toInt();
  }

  void _report() => widget.onStatus(LearnWidgetStatus(
        interacted: _interacted,
        targetMet: _targetMet,
        detail:
            'base=$_base, height=$_height, area=$_area${_targetArea == null ? '' : ', target=$_targetArea'}',
      ));

  void _update({int? base, int? height}) {
    final b = (base ?? _base).clamp(2, _maxDim);
    final h = (height ?? _height).clamp(2, _maxDim);
    if (b == _base && h == _height) return;
    final wasMet = _targetMet;
    setState(() {
      _base = b;
      _height = h;
      _interacted = true;
    });
    HapticFeedback.selectionClick();
    if (!wasMet && _targetMet) HapticFeedback.mediumImpact();
    _report();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final hit = _targetMet;
    final accent = hit ? Palette.green : cs.primary;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AspectRatio(
          aspectRatio: 1,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final size = constraints.biggest;
              const pad = 28.0;
              final scale = (size.width - pad * 2) / _maxDim;
              // Geometry is drawn LTR regardless of text direction; the
              // right angle sits bottom-left, matching the labels below.
              final origin = Offset(pad, size.height - pad);
              final baseHandle = origin + Offset(_base * scale, 0);
              final heightHandle = origin - Offset(0, _height * scale);

              void onPanStart(DragStartDetails d) {
                if (!_draggable) return;
                final p = d.localPosition;
                const grab = 36.0;
                final dBase = (p - baseHandle).distance;
                final dHeight = (p - heightHandle).distance;
                if (dBase > grab && dHeight > grab) return;
                _dragging = dBase <= dHeight ? 'base' : 'height';
              }

              void onPanUpdate(DragUpdateDetails d) {
                switch (_dragging) {
                  case 'base':
                    _update(
                      base: ((d.localPosition.dx - origin.dx) / scale).round(),
                    );
                  case 'height':
                    _update(
                      height: ((origin.dy - d.localPosition.dy) / scale).round(),
                    );
                }
              }

              return GestureDetector(
                onPanStart: onPanStart,
                onPanUpdate: onPanUpdate,
                onPanEnd: (_) => _dragging = null,
                onPanCancel: () => _dragging = null,
                child: CustomPaint(
                  size: size,
                  painter: _TrianglePainter(
                    origin: origin,
                    scale: scale,
                    maxDim: _maxDim,
                    base: _base,
                    height: _height,
                    accent: accent,
                    showHandles: _draggable,
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 4),
        Text(
          // e.g. "القاعدة: 6 م • الارتفاع: 4 م"
          '${trLearnWidget(context, 'base')}: $_base $_unit • '
          '${trLearnWidget(context, 'height')}: $_height $_unit',
          style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant),
        ),
        const SizedBox(height: 2),
        AnimatedDefaultTextStyle(
          duration: const Duration(milliseconds: 200),
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w800,
            color: hit ? Palette.greenShadow : cs.onSurface,
          ),
          child: Text(
            '${trLearnWidget(context, 'area')} = $_area $_unit²'
            '${_targetArea == null ? '' : '  /  ${trLearnWidget(context, 'goal')}: $_targetArea $_unit²'}',
          ),
        ),
      ],
    );
  }
}

/// The two labels this manipulative needs, bilingual like tr() in palette.dart
/// (the catalog content itself carries its own language).
String trLearnWidget(BuildContext context, String key) {
  final ar = Directionality.of(context) == TextDirection.rtl;
  return switch (key) {
    'base' => ar ? 'القاعدة' : 'Base',
    'height' => ar ? 'الارتفاع' : 'Height',
    'area' => ar ? 'المساحة' : 'Area',
    'goal' => ar ? 'الهدف' : 'Goal',
    _ => key,
  };
}

class _TrianglePainter extends CustomPainter {
  _TrianglePainter({
    required this.origin,
    required this.scale,
    required this.maxDim,
    required this.base,
    required this.height,
    required this.accent,
    required this.showHandles,
  });

  final Offset origin;
  final double scale;
  final int maxDim;
  final int base;
  final int height;
  final Color accent;
  final bool showHandles;

  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = Colors.grey.withValues(alpha: 0.22)
      ..strokeWidth = 1;
    for (var i = 0; i <= maxDim; i++) {
      final x = origin.dx + i * scale;
      final y = origin.dy - i * scale;
      canvas.drawLine(Offset(x, origin.dy), Offset(x, origin.dy - maxDim * scale), grid);
      canvas.drawLine(Offset(origin.dx, y), Offset(origin.dx + maxDim * scale, y), grid);
    }

    final p1 = origin;
    final p2 = origin + Offset(base * scale, 0);
    final p3 = origin - Offset(0, height * scale);
    final tri = Path()
      ..moveTo(p1.dx, p1.dy)
      ..lineTo(p2.dx, p2.dy)
      ..lineTo(p3.dx, p3.dy)
      ..close();
    canvas.drawPath(
      tri,
      Paint()..color = accent.withValues(alpha: 0.18),
    );
    canvas.drawPath(
      tri,
      Paint()
        ..color = accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.5
        ..strokeJoin = StrokeJoin.round,
    );

    // Right-angle mark at the origin corner.
    final mark = Paint()
      ..color = accent.withValues(alpha: 0.7)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    const m = 14.0;
    canvas.drawPath(
      Path()
        ..moveTo(p1.dx + m, p1.dy)
        ..lineTo(p1.dx + m, p1.dy - m)
        ..lineTo(p1.dx, p1.dy - m),
      mark,
    );

    if (showHandles) {
      for (final h in [p2, p3]) {
        canvas.drawCircle(h, 12, Paint()..color = Colors.white);
        canvas.drawCircle(
          h,
          12,
          Paint()
            ..color = accent
            ..style = PaintingStyle.stroke
            ..strokeWidth = 4,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _TrianglePainter old) =>
      old.base != base ||
      old.height != height ||
      old.accent != accent ||
      old.scale != scale ||
      old.showHandles != showHandles;
}
