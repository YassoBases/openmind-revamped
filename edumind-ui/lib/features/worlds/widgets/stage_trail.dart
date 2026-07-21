import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../core/palette.dart';
import '../world_models.dart';

/// The winding stage trail of one Lesson World, with the GROWING WORLD layer:
/// every cleared stage permanently adds a landscape element (tree, house,
/// flower, creature…) beside its node — the child's progress is visible life,
/// not just checkmarks. Elements are derived deterministically from
/// (worldId, stageIndex, subject): no extra storage beyond the completed set.
///
/// Visual language follows the middle-school TrailMap (winding wave,
/// state-driven nodes, RTL mirroring) without touching that product's code.
class StageTrail extends StatelessWidget {
  const StageTrail({
    super.key,
    required this.worldId,
    required this.subject,
    required this.stages,
    required this.states,
    required this.onOpen,
  });

  final String worldId;
  final String subject;
  final List<WorldStage> stages;
  final List<StageNodeState> states;
  final ValueChanged<WorldStage> onOpen;

  static const _rowH = 116.0;
  static const _topPad = 44.0;
  static const _node = 62.0;

  /// Horizontal wave the trail follows (fractions of the width).
  static const _wave = [0.5, 0.22, 0.5, 0.78];

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final n = stages.length;
    final height = _topPad + _rowH * (n - 1) + _node + 52;

    return LayoutBuilder(builder: (context, constraints) {
      final w = constraints.maxWidth;
      Offset center(int i) {
        var f = _wave[i % _wave.length];
        if (rtl) f = 1 - f;
        return Offset(w * f, _topPad + _rowH * i + _node / 2);
      }

      final centers = [for (var i = 0; i < n; i++) center(i)];

      return SizedBox(
        height: height,
        child: Stack(children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _GrownWorldPainter(
                worldId: worldId,
                subject: subject,
                centers: centers,
                states: states,
                rtl: rtl,
              ),
            ),
          ),
          Positioned.fill(
            child: CustomPaint(
              painter: _RoutePainter(centers: centers, states: states),
            ),
          ),
          for (var i = 0; i < n; i++) _station(context, l, i, centers[i], w),
        ]),
      );
    });
  }

  Widget _station(BuildContext context, AppLocalizations l, int i, Offset c, double w) {
    final stage = stages[i];
    final state = states[i];
    final isFinale = stage.index == stages.length;
    final open = state != StageNodeState.locked;

    final Color fill;
    final Widget inner;
    switch (state) {
      case StageNodeState.completed:
        fill = Palette.green;
        inner = _Stars(count: stage.stars ?? 1);
      case StageNodeState.current:
        fill = Palette.blue;
        inner = const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 34);
      case StageNodeState.locked:
        fill = Palette.card;
        inner = Icon(isFinale ? Icons.emoji_events_rounded : Icons.lock_rounded,
            color: Palette.grey, size: 24);
    }

    final label = isFinale
        ? l.translate('world_finale')
        : l.translateWith('world_stage_n', {'n': '${stage.index}'});

    return Positioned(
      left: c.dx - _node / 2,
      top: c.dy - _node / 2,
      child: Semantics(
        button: open,
        label: '$label${stage.focus == null ? '' : ' — ${stage.focus}'}',
        child: GestureDetector(
          onTap: open ? () => onOpen(stage) : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                width: _node,
                height: _node,
                decoration: BoxDecoration(
                  color: fill,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: state == StageNodeState.current
                        ? Palette.soft
                        : Colors.transparent,
                    width: 3,
                  ),
                  boxShadow: state == StageNodeState.current
                      ? [
                          BoxShadow(
                            color: Palette.blue.withValues(alpha: 0.55),
                            blurRadius: 18,
                            spreadRadius: 2,
                          )
                        ]
                      : const [],
                ),
                child: Center(child: inner),
              ),
              const SizedBox(height: 4),
              SizedBox(
                width: 120,
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: open ? Palette.soft : Palette.grey,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stars extends StatelessWidget {
  const _Stars({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 3; i++)
          Icon(
            i < count ? Icons.star_rounded : Icons.star_border_rounded,
            color: Palette.yellow,
            size: 15,
          ),
      ],
    );
  }
}

/// The traveled/ahead route between stations.
class _RoutePainter extends CustomPainter {
  _RoutePainter({required this.centers, required this.states});

  final List<Offset> centers;
  final List<StageNodeState> states;

  @override
  void paint(Canvas canvas, Size size) {
    final done = Paint()
      ..color = Palette.green
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round;
    final ahead = Paint()
      ..color = Palette.cardBorder
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;

    for (var i = 0; i < centers.length - 1; i++) {
      final a = centers[i];
      final b = centers[i + 1];
      final mid = Offset((a.dx + b.dx) / 2, (a.dy + b.dy) / 2 + 18);
      final path = Path()
        ..moveTo(a.dx, a.dy)
        ..quadraticBezierTo(mid.dx, mid.dy, b.dx, b.dy);
      final traveled = states[i] == StageNodeState.completed;
      canvas.drawPath(path, traveled ? done : ahead);
    }
  }

  @override
  bool shouldRepaint(_RoutePainter old) =>
      old.states != states || old.centers != centers;
}

/// The growing world: one procedural landscape element per COMPLETED stage,
/// placed beside its node, seeded by (worldId, stageIndex) so it is stable
/// forever and identical offline. Math worlds grow a little town; science
/// worlds grow a little garden.
class _GrownWorldPainter extends CustomPainter {
  _GrownWorldPainter({
    required this.worldId,
    required this.subject,
    required this.centers,
    required this.states,
    required this.rtl,
  });

  final String worldId;
  final String subject;
  final List<Offset> centers;
  final List<StageNodeState> states;
  final bool rtl;

  bool get _town => subject.toLowerCase().contains('math') ||
      subject.contains('رياضيات') || subject.contains('الرياضيات');

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < centers.length; i++) {
      if (states[i] != StageNodeState.completed) continue;
      final rnd = math.Random(worldId.hashCode ^ (i + 1) * 7919);
      final c = centers[i];
      // Place the element on the roomier side of the node.
      final side = (c.dx < size.width / 2) ? 1.0 : -1.0;
      final base = Offset(
        c.dx + side * (72 + rnd.nextDouble() * 26),
        c.dy + 18,
      );
      final kind = rnd.nextInt(3);
      if (_town) {
        switch (kind) {
          case 0:
            _house(canvas, base, rnd);
          case 1:
            _tower(canvas, base, rnd);
          default:
            _tree(canvas, base, rnd);
        }
      } else {
        switch (kind) {
          case 0:
            _tree(canvas, base, rnd);
          case 1:
            _flower(canvas, base, rnd);
          default:
            _bush(canvas, base, rnd);
        }
      }
    }
  }

  void _house(Canvas canvas, Offset b, math.Random rnd) {
    final wall = Paint()..color = Palette.soft.withValues(alpha: 0.92);
    final roof = Paint()..color = Palette.yellow;
    final w = 26.0 + rnd.nextDouble() * 8;
    canvas.drawRect(Rect.fromCenter(center: b, width: w, height: w * 0.8), wall);
    final path = Path()
      ..moveTo(b.dx - w / 2 - 3, b.dy - w * 0.4)
      ..lineTo(b.dx, b.dy - w * 0.85)
      ..lineTo(b.dx + w / 2 + 3, b.dy - w * 0.4)
      ..close();
    canvas.drawPath(path, roof);
    canvas.drawRect(
        Rect.fromCenter(center: Offset(b.dx, b.dy + w * 0.14), width: w * 0.26, height: w * 0.5),
        Paint()..color = Palette.blueShadow);
  }

  void _tower(Canvas canvas, Offset b, math.Random rnd) {
    final body = Paint()..color = Palette.grey.withValues(alpha: 0.9);
    final h = 34.0 + rnd.nextDouble() * 12;
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromCenter(center: Offset(b.dx, b.dy - h / 4), width: 18, height: h),
            const Radius.circular(4)),
        body);
    for (var i = 0; i < 3; i++) {
      canvas.drawCircle(Offset(b.dx, b.dy - h / 4 - h / 3 + i * (h / 3.2)), 2.6,
          Paint()..color = Palette.yellow);
    }
  }

  void _tree(Canvas canvas, Offset b, math.Random rnd) {
    final trunk = Paint()..color = Palette.purple;
    final leaf = Paint()..color = Palette.green;
    final r = 12.0 + rnd.nextDouble() * 6;
    canvas.drawRect(Rect.fromCenter(center: Offset(b.dx, b.dy), width: 5, height: 18), trunk);
    canvas.drawCircle(Offset(b.dx, b.dy - 16), r, leaf);
    canvas.drawCircle(Offset(b.dx - r * 0.6, b.dy - 10), r * 0.7, leaf);
    canvas.drawCircle(Offset(b.dx + r * 0.6, b.dy - 10), r * 0.7, leaf);
  }

  void _flower(Canvas canvas, Offset b, math.Random rnd) {
    final stem = Paint()
      ..color = Palette.green
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(b, Offset(b.dx, b.dy - 18), stem);
    final petal = Paint()..color = Palette.heart;
    for (var a = 0; a < 5; a++) {
      final ang = a * 2 * math.pi / 5 + rnd.nextDouble() * 0.2;
      canvas.drawCircle(
          Offset(b.dx + math.cos(ang) * 6, b.dy - 18 + math.sin(ang) * 6), 4, petal);
    }
    canvas.drawCircle(Offset(b.dx, b.dy - 18), 4, Paint()..color = Palette.yellow);
  }

  void _bush(Canvas canvas, Offset b, math.Random rnd) {
    final leaf = Paint()..color = Palette.green.withValues(alpha: 0.95);
    final r = 9.0 + rnd.nextDouble() * 4;
    canvas.drawCircle(Offset(b.dx - r, b.dy), r, leaf);
    canvas.drawCircle(Offset(b.dx + r * 0.8, b.dy - 2), r * 1.1, leaf);
    canvas.drawCircle(Offset(b.dx, b.dy - r * 0.8), r * 0.9, leaf);
    canvas.drawCircle(Offset(b.dx + r * 0.2, b.dy + 2), 2.5, Paint()..color = Palette.heart);
  }

  @override
  bool shouldRepaint(_GrownWorldPainter old) =>
      old.states != states || old.centers != centers || old.worldId != worldId;
}
