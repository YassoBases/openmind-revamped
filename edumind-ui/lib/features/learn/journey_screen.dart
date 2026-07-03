import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/palette.dart';
import 'experience_screen.dart';
import 'journey_logic.dart';
import 'learn_catalog.dart';
import 'learn_models.dart';
import 'learn_progress_store.dart';

/// "رحلتي" — the real Grade-7 learning map. Every path is a connected area:
/// its experiences are stations on a winding trail (painted connectors, not a
/// list of cards), with a true state per node — completed / current position
/// («أنت هنا») / locked / honest «قريبًا» — computed by journey_logic.dart
/// from persisted progress (local + backend-synced). Tapping an open station
/// launches the real interactive experience.
class JourneyScreen extends StatefulWidget {
  const JourneyScreen({super.key});

  @override
  State<JourneyScreen> createState() => _JourneyScreenState();
}

class _JourneyScreenState extends State<JourneyScreen> {
  List<LearnCatalog>? _catalogs;
  Set<String> _completed = {};

  @override
  void initState() {
    super.initState();
    _load();
    // Progress can change while this tab sits in the IndexedStack (an
    // experience finished from Home, or a background backend sync).
    LearnProgressStore.revision.addListener(_onProgressChanged);
  }

  @override
  void dispose() {
    LearnProgressStore.revision.removeListener(_onProgressChanged);
    super.dispose();
  }

  void _onProgressChanged() {
    if (mounted) _load(sync: false);
  }

  Future<void> _load({bool sync = true}) async {
    final catalogs = await LearnCatalogLoader.catalogs();
    final store = await LearnProgressStore.load();
    if (mounted) {
      setState(() {
        _catalogs = catalogs;
        _completed = store.completed;
      });
    }
    // Reconcile with the backend in the background; refresh if it changed.
    if (sync && await store.syncWithBackend() && mounted) {
      setState(() => _completed = store.completed);
    }
  }

  Future<void> _open(LearnPath path, LearnExperience experience) async {
    await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => ExperienceScreen(path: path, experience: experience),
      ),
    );
    if (mounted) await _load(sync: false);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final catalogs = _catalogs;

    return Scaffold(
      body: SafeArea(
        child: catalogs == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 28, 20, 96),
                children: [
                  Text(
                    l.translate('journey_title'),
                    style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l.translate('journey_subtitle'),
                    style: TextStyle(fontSize: 14, height: 1.6, color: cs.onSurfaceVariant),
                  ),
                  const SizedBox(height: 20),
                  for (final catalog in catalogs) ...[
                    Text(
                      '${catalog.subject} — ${l.translate('learn_grade')} ${catalog.grade}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: cs.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final path in catalog.paths) _pathArea(path, l),
                  ],
                ],
              ),
      ),
    );
  }

  /// One connected area of the map: header + winding station trail.
  Widget _pathArea(LearnPath path, AppLocalizations l) {
    final cs = Theme.of(context).colorScheme;
    final accent = hexToColor(path.colorHex);
    final states = journeyNodeStates(path, _completed);
    final (done, ready) = pathProgress(path, _completed);

    return Container(
      margin: const EdgeInsets.only(bottom: 22),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.04),
        border: Border.all(color: accent.withValues(alpha: 0.25)),
        borderRadius: BorderRadius.circular(Palette.radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(Palette.radiusButton),
                ),
                alignment: Alignment.center,
                child: Text(path.emoji, style: const TextStyle(fontSize: 22)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      path.title,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                    ),
                    Text(
                      path.tagline,
                      style: TextStyle(fontSize: 12.5, height: 1.5, color: cs.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '$done/$ready',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: done == ready && ready > 0 ? accent : cs.onSurfaceVariant,
                ),
              ),
            ],
          ),
          _TrailMap(
            path: path,
            states: states,
            accent: accent,
            onOpen: (e) => _open(path, e),
          ),
        ],
      ),
    );
  }
}

/// The winding trail of one path: stations at alternating offsets, joined by
/// a painted route. Pure presentation — states come from journey_logic.
class _TrailMap extends StatelessWidget {
  const _TrailMap({
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
      ..strokeWidth = 3
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
