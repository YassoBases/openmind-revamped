import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/middle_palette.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../widgets/mascot.dart';
import 'checkpoint_logic.dart';
import 'experience_screen.dart';
import 'journey_logic.dart';
import 'learn_catalog.dart';
import 'learn_evidence_store.dart';
import 'learn_models.dart';
import 'learn_progress_store.dart';
import 'readiness_logic.dart';
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
  LearnCatalog? _catalog;
  Map<String, Readiness> _readiness = {};
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
    LearnProgressStore.revision.addListener(_onProgressChanged);
    LearnEvidenceStore.revision.addListener(_onProgressChanged);
  }

  @override
  void dispose() {
    LearnProgressStore.revision.removeListener(_onProgressChanged);
    LearnEvidenceStore.revision.removeListener(_onProgressChanged);
    super.dispose();
  }

  void _onProgressChanged() {
    if (mounted) _load();
  }

  Future<void> _load() async {
    final store = await LearnProgressStore.load();
    final evidence = await LearnEvidenceStore.load();
    // The catalog that owns this path — needed for its skills map (checkpoints).
    final catalogs = await LearnCatalogLoader.catalogs(
      language: Session.instance.language,
      grade: Session.instance.grade,
    );
    final catalog = catalogs
        .where((c) => c.paths.any((p) => p.id == widget.path.id))
        .cast<LearnCatalog?>()
        .firstWhere((c) => c != null, orElse: () => null);
    if (mounted) {
      setState(() {
        _completed = store.completed;
        _catalog = catalog;
        _readiness = deriveSkillReadiness(evidence.events);
        _loaded = true;
      });
    }
  }

  /// The first checkpoint whose cluster is now due: its gate experience is
  /// completed and the checkpoint itself has not been taken. Null otherwise.
  LearnCheckpoint? get _dueCheckpoint {
    for (final c in widget.path.checkpoints) {
      final gateDone = _completed.contains('${widget.path.id}/${c.afterExperience}');
      final taken = _completed.contains('${widget.path.id}/${c.id}');
      if (gateDone && !taken) return c;
    }
    return null;
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

  Future<void> _openCheckpoint(LearnCheckpoint checkpoint) async {
    final catalog = _catalog;
    if (catalog == null) return;
    // Assembled fresh from the learner's current readiness — drills for weak
    // skills, revisits for developing ones (see checkpoint_logic).
    final synthetic = buildCheckpointExperience(
      checkpoint,
      catalog,
      widget.path,
      _readiness,
      seed: DateTime.now().millisecondsSinceEpoch & 0x7fffffff,
    );
    await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => ExperienceScreen(
          path: widget.path,
          experience: synthetic,
          isCheckpoint: true,
        ),
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
    // The next meaningful goal on the current station — same forward pointer
    // as the journey list row, repeated here where the learner actually is.
    final catalog = _catalog;
    final current = currentExperience(path, _completed);
    final goal = current == null || catalog == null
        ? null
        : nextGoal(current, catalog, _readiness);

    return Scaffold(
      backgroundColor: MiddlePalette.cream,
      appBar: AppBar(
        backgroundColor: MiddlePalette.cream,
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
                  _header(l, path, accent, done, ready, goal),
                  if (ready > 0 && done == ready) ...[
                    const SizedBox(height: 12),
                    _pathCompleteCard(path, catalog, l),
                  ],
                  if (_dueCheckpoint case final cp?) ...[
                    const SizedBox(height: 12),
                    _checkpointCard(cp, l),
                  ],
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

  /// A due-checkpoint invitation — the diagnostic after a cluster of skills.
  /// Deliberately distinct from an ordinary path/experience card: primary-
  /// action blue, not the path's own identity color, so it reads as its own
  /// kind of moment rather than another station.
  Widget _checkpointCard(LearnCheckpoint cp, AppLocalizations l) {
    const accent = MiddlePalette.primaryAction;
    return Material(
      color: accent.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(Palette.radiusCard),
      child: InkWell(
        borderRadius: BorderRadius.circular(Palette.radiusCard),
        onTap: () => _openCheckpoint(cp),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: accent.withValues(alpha: 0.45), width: 1.4),
            borderRadius: BorderRadius.circular(Palette.radiusCard),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                ),
                child: const Text('🎯', style: TextStyle(fontSize: 20)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        l.translate('checkpoint_title'),
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: accent,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l.translate('checkpoint_sub'),
                      style: const TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: MiddlePalette.body,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_rounded, color: accent),
            ],
          ),
        ),
      ),
    );
  }

  /// Hudhud's path-end summary: shown once every ready station is complete —
  /// names the skills that reached real readiness on this path, plus one
  /// authored line on how they help in life (planning, design, technology,
  /// engineering, or everyday problem solving). Additive to this same trail
  /// screen — never a separate "path complete" route.
  Widget _pathCompleteCard(LearnPath path, LearnCatalog? catalog, AppLocalizations l) {
    final skills = <LearnSkill>[];
    if (catalog != null) {
      final ids = <String>{};
      for (final exp in path.experiences) {
        for (final step in exp.steps) {
          ids.addAll(step.skills);
          for (final item in step.checkItems) {
            ids.addAll(item.skills.isNotEmpty ? item.skills : step.skills);
          }
          final choice = step.choice;
          if (choice != null) {
            ids.addAll(choice.skills.isNotEmpty ? choice.skills : step.skills);
          }
        }
      }
      for (final id in ids) {
        final level = _readiness[id]?.level;
        if (level != ReadinessLevel.developing && level != ReadinessLevel.secure) {
          continue;
        }
        final skill = catalog.skills[id];
        if (skill != null) skills.add(skill);
      }
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MiddlePalette.card,
        border: Border.all(color: MiddlePalette.outline),
        borderRadius: BorderRadius.circular(Palette.radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Mascot(
                size: 44,
                accent: MiddlePalette.blueInk,
                expression: MascotExpression.celebrating,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l.translate('path_complete_title'),
                  style: const TextStyle(
                    fontSize: 15.5,
                    fontWeight: FontWeight.w800,
                    color: MiddlePalette.blueInk,
                  ),
                ),
              ),
            ],
          ),
          if (skills.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final s in skills)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                    decoration: BoxDecoration(
                      color: MiddlePalette.softBlue,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      s.title,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: MiddlePalette.blueInk,
                      ),
                    ),
                  ),
              ],
            ),
          ],
          if (path.lifeConnection case final note?) ...[
            const SizedBox(height: 10),
            Text(
              note,
              style: const TextStyle(fontSize: 13.5, height: 1.7, color: MiddlePalette.body),
            ),
          ],
        ],
      ),
    );
  }

  Widget _header(
    AppLocalizations l,
    LearnPath path,
    Color accent,
    int done,
    int ready,
    LearnSkill? goal,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MiddlePalette.card,
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
              color: MiddlePalette.discovery,
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
          if (goal != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: MiddlePalette.discovery.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.flag_rounded, size: 14, color: MiddlePalette.discovery),
                  const SizedBox(width: 5),
                  Flexible(
                    child: Text(
                      l.translateWith('journey_next_goal', {'skill': goal.title}),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: MiddlePalette.discovery,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
