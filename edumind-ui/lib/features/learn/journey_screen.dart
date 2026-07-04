import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/middle_palette.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../widgets/mascot.dart';
import 'grade_soon_view.dart';
import 'journey_logic.dart';
import 'learn_catalog.dart';
import 'learn_models.dart';
import 'learn_progress_store.dart';
import 'path_screen.dart';

/// "رحلتي" — the curriculum path list. One decision: pick a path. Each row
/// is a path's identity (icon, title, «يعبر عن», honest ready-progress);
/// tapping pushes the path's own station trail (PathScreen). Catalogs are
/// grade-gated: a grade without authored content gets the honest
/// GradeSoonView, never another grade's map.
class JourneyScreen extends StatefulWidget {
  const JourneyScreen({super.key, this.onAskTutor});

  /// Jumps to the مساعدي tab (wired by the root shell) — the one real
  /// capability offered while a grade's curriculum is still being built.
  final VoidCallback? onAskTutor;

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
    final catalogs = await LearnCatalogLoader.catalogs(
      language: Session.instance.language,
      grade: Session.instance.grade,
    );
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

  void _openPath(LearnPath path) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => PathScreen(path: path)),
    ).then((_) {
      if (mounted) _load(sync: false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final catalogs = _catalogs;

    return Scaffold(
      backgroundColor: MiddlePalette.ivory,
      body: SafeArea(
        child: catalogs == null
            ? const Center(child: CircularProgressIndicator())
            : catalogs.isEmpty
                ? GradeSoonView(
                    grade: Session.instance.grade,
                    onAskTutor: widget.onAskTutor,
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 28, 20, 96),
                    children: [
                      Text(
                        l.translate('journey_title'),
                        style: const TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.w900,
                          color: MiddlePalette.blueInk,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        l.translate('journey_pick_sub'),
                        style: const TextStyle(
                          fontSize: 14,
                          height: 1.6,
                          color: MiddlePalette.body,
                        ),
                      ),
                      // Hudhud's guide moment — only until real progress
                      // exists; a returning learner gets a quiet header.
                      if (_completed.isEmpty) ...[
                        const SizedBox(height: 14),
                        _hudhudMoment(l),
                      ],
                      const SizedBox(height: 18),
                      for (final catalog in catalogs) ...[
                        Text(
                          '${catalog.subject} — '
                          '${l.translate('learn_grade')} ${catalog.grade}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: MiddlePalette.body,
                          ),
                        ),
                        const SizedBox(height: 12),
                        for (final path in catalog.paths) _pathRow(path, l),
                      ],
                    ],
                  ),
      ),
    );
  }

  Widget _hudhudMoment(AppLocalizations l) {
    return Row(
      children: [
        const Mascot(
          size: 56,
          accent: MiddlePalette.blueInk,
          expression: MascotExpression.happy,
        ),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: MiddlePalette.softBlue,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            l.translate('journey_pick_path'),
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: MiddlePalette.blueInk,
            ),
          ),
        ),
      ],
    );
  }

  /// One path row: identity + honest progress, one tap → its trail.
  Widget _pathRow(LearnPath path, AppLocalizations l) {
    final accent = hexToColor(path.colorHex);
    final (done, ready) = pathProgress(path, _completed);
    final rtl = Directionality.of(context) == TextDirection.rtl;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(Palette.radiusCard),
        child: InkWell(
          borderRadius: BorderRadius.circular(Palette.radiusCard),
          onTap: () => _openPath(path),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              border: Border.all(color: MiddlePalette.outline),
              borderRadius: BorderRadius.circular(Palette.radiusCard),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
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
                        style: const TextStyle(
                          fontSize: 15.5,
                          fontWeight: FontWeight.w800,
                          color: MiddlePalette.blueInk,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        path.tagline,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          height: 1.4,
                          color: MiddlePalette.body,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (ready > 0)
                  SizedBox(
                    width: 26,
                    height: 26,
                    child: CircularProgressIndicator(
                      value: done / ready,
                      strokeWidth: 3.5,
                      color: accent,
                      backgroundColor: MiddlePalette.softBlue,
                    ),
                  )
                else
                  Text(
                    l.translate('learn_soon'),
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: MiddlePalette.body,
                    ),
                  ),
                const SizedBox(width: 6),
                Icon(
                  rtl ? Icons.chevron_left_rounded : Icons.chevron_right_rounded,
                  color: MiddlePalette.body,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
