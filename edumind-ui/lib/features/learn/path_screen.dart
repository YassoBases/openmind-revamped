import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/middle_palette.dart';
import '../../core/palette.dart';
import 'experience_screen.dart';
import 'journey_logic.dart';
import 'learn_models.dart';
import 'learn_progress_store.dart';
import 'widgets/trail_map.dart';

/// One learning path's detail: identity header (icon, title, «يعبر عن»,
/// honest ready-progress) above the winding station trail. Single job:
/// pick or continue a station. States come from journey_logic; progress
/// refreshes live through LearnProgressStore.revision.
class PathScreen extends StatefulWidget {
  const PathScreen({super.key, required this.path});

  final LearnPath path;

  @override
  State<PathScreen> createState() => _PathScreenState();
}

class _PathScreenState extends State<PathScreen> {
  Set<String> _completed = {};
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
    LearnProgressStore.revision.addListener(_onProgressChanged);
  }

  @override
  void dispose() {
    LearnProgressStore.revision.removeListener(_onProgressChanged);
    super.dispose();
  }

  void _onProgressChanged() {
    if (mounted) _load();
  }

  Future<void> _load() async {
    final store = await LearnProgressStore.load();
    if (mounted) {
      setState(() {
        _completed = store.completed;
        _loaded = true;
      });
    }
  }

  Future<void> _open(LearnExperience experience) async {
    await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            ExperienceScreen(path: widget.path, experience: experience),
      ),
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final path = widget.path;
    final accent = hexToColor(path.colorHex);
    final states = journeyNodeStates(path, _completed);
    final (done, ready) = pathProgress(path, _completed);

    return Scaffold(
      backgroundColor: MiddlePalette.ivory,
      appBar: AppBar(
        backgroundColor: MiddlePalette.ivory,
        surfaceTintColor: Colors.transparent,
        title: Text(
          path.title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: MiddlePalette.blueInk,
          ),
        ),
      ),
      body: SafeArea(
        child: !_loaded
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                children: [
                  _header(l, path, accent, done, ready),
                  TrailMap(
                    path: path,
                    states: states,
                    accent: accent,
                    onOpen: _open,
                  ),
                ],
              ),
      ),
    );
  }

  Widget _header(
    AppLocalizations l,
    LearnPath path,
    Color accent,
    int done,
    int ready,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: MiddlePalette.outline),
        borderRadius: BorderRadius.circular(Palette.radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(Palette.radiusButton),
                ),
                alignment: Alignment.center,
                child: Text(path.emoji, style: const TextStyle(fontSize: 24)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      path.title,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: MiddlePalette.blueInk,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      path.tagline,
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.5,
                        color: MiddlePalette.body,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: ready == 0 ? 0 : done / ready,
              minHeight: 8,
              color: accent,
              backgroundColor: MiddlePalette.softBlue,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            // Honest language: counts only what is truly playable today.
            l.translateWith(
                'path_ready_progress', {'n': '$done', 'm': '$ready'}),
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: MiddlePalette.body,
            ),
          ),
        ],
      ),
    );
  }
}
