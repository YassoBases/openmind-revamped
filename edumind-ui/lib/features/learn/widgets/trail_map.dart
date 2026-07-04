import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../journey_logic.dart';
import '../learn_models.dart';

/// The winding trail of one path: stations at alternating offsets, joined by
/// a painted route. Pure presentation — states come from journey_logic.
/// Extracted from the journey screen so the path-detail screen owns it.
class TrailMap extends StatelessWidget {
  const TrailMap({
    super.key,
    required this.path,
    required this.states,
    required this.accent,
    required this.onOpen,
  });

  final LearnPath path;
  final List<JourneyNodeState> states;
  final Color accent;
  final ValueChanged<LearnExperience> onOpen;

  static const _rowH = 112.0;
  static const _topPad = 40.0;
  static const _node = 58.0;
  static const _labelW = 132.0;

  /// Horizontal wave the trail follows (fractions of the width).
  static const _wave = [0.5, 0.2, 0.5, 0.8];

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final n = path.experiences.length;
    final height = _topPad + _rowH * (n - 1) + _node + 46;

    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        Offset center(int i) {
          var f = _wave[i % _wave.length];
          if (rtl) f = 1 - f;
          return Offset(w * f, _topPad + _rowH * i + _node / 2);
        }

        final centers = [for (var i = 0; i < n; i++) center(i)];

        return SizedBox(
          height: height,
          child: Stack(
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _TrailPainter(
                    centers: centers,
                    states: states,
                    accent: accent,
                    idle: cs.outlineVariant,
                  ),
                ),
              ),
              for (var i = 0; i < n; i++) ..._station(
                context, l, cs, path.experiences[i], states[i], centers[i]),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _station(
    BuildContext context,
    AppLocalizations l,
    ColorScheme cs,
    LearnExperience e,
    JourneyNodeState state,
    Offset c,
  ) {
    final openable =
        state == JourneyNodeState.completed || state == JourneyNodeState.current;
    final current = state == JourneyNodeState.current;

    final circle = switch (state) {
      JourneyNodeState.completed => Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: accent,
            boxShadow: [
              BoxShadow(
                color: accent.withValues(alpha: 0.35),
                blurRadius: 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: const Icon(Icons.check_rounded, size: 28, color: Colors.white),
        ),
      JourneyNodeState.current => Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: cs.surface,
            border: Border.all(color: accent, width: 3),
            boxShadow: [
              BoxShadow(
                color: accent.withValues(alpha: 0.30),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Icon(Icons.play_arrow_rounded, size: 30, color: accent),
        ),
      JourneyNodeState.locked => Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: cs.surfaceContainerHighest,
            border: Border.all(color: cs.outlineVariant),
          ),
          child: Icon(Icons.lock_rounded, size: 20, color: cs.onSurfaceVariant),
        ),
      JourneyNodeState.soon => Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: cs.surfaceContainerHighest.withValues(alpha: 0.6),
            border: Border.all(color: cs.outlineVariant),
          ),
          child: Icon(Icons.more_horiz_rounded, size: 22, color: cs.onSurfaceVariant),
        ),
    };

    final subLabel = switch (state) {
      JourneyNodeState.soon => l.translate('learn_soon'),
      JourneyNodeState.locked => l.translate('journey_locked'),
      JourneyNodeState.completed => l.translate('learn_replay'),
      JourneyNodeState.current => null,
    };

    return [
      // «أنت هنا» — the learner's position on the map.
      if (current)
        Positioned(
          left: c.dx - 50,
          top: c.dy - _node / 2 - 30,
          width: 100,
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: accent,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                l.translate('journey_here'),
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ),
      Positioned(
        left: c.dx - _node / 2,
        top: c.dy - _node / 2,
        width: _node,
        height: _node,
        child: Semantics(
          button: openable,
          label: e.title,
          child: InkResponse(
            radius: _node / 2 + 6,
            onTap: openable ? () => onOpen(e) : null,
            child: circle,
          ),
        ),
      ),
      Positioned(
        left: c.dx - _labelW / 2,
        top: c.dy + _node / 2 + 6,
        width: _labelW,
        child: GestureDetector(
          onTap: openable ? () => onOpen(e) : null,
          child: Column(
            children: [
              Text(
                e.title,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  height: 1.35,
                  fontWeight: current ? FontWeight.w800 : FontWeight.w600,
                  color: openable ? cs.onSurface : cs.onSurfaceVariant,
                ),
              ),
              if (subLabel != null)
                Text(
                  subLabel,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: state == JourneyNodeState.completed
                        ? accent
                        : cs.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ),
      ),
    ];
  }
}

/// Paints the route between stations: a smooth S-curve, colored up to the
/// learner's position and faded beyond it.
class _TrailPainter extends CustomPainter {
  _TrailPainter({
    required this.centers,
    required this.states,
    required this.accent,
    required this.idle,
  });

  final List<Offset> centers;
  final List<JourneyNodeState> states;
  final Color accent;
  final Color idle;

  @override
  void paint(Canvas canvas, Size size) {
    final paintDone = Paint()
      ..color = accent.withValues(alpha: 0.55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    final paintIdle = Paint()
      ..color = idle.withValues(alpha: 0.7)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;

    for (var i = 0; i + 1 < centers.length; i++) {
      final a = centers[i];
      final b = centers[i + 1];
      final midY = (a.dy + b.dy) / 2;
      final path = Path()
        ..moveTo(a.dx, a.dy)
        ..cubicTo(a.dx, midY, b.dx, midY, b.dx, b.dy);
      // The segment leaving a completed station is part of the traveled road.
      final traveled = states[i] == JourneyNodeState.completed;
      canvas.drawPath(path, traveled ? paintDone : paintIdle);
    }
  }

  @override
  bool shouldRepaint(_TrailPainter old) =>
      old.centers != centers ||
      old.states != states ||
      old.accent != accent ||
      old.idle != idle;
}
