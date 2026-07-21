import 'dart:convert';

import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../core/xp_store.dart';
import '../../data/game_store.dart';
import '../../widgets/mascot.dart';
import '../player/player_screen.dart';
import 'stage_reward_screen.dart';
import 'widgets/stage_trail.dart';
import 'world_models.dart';
import 'world_store.dart';

/// One Lesson World: the stage map. Offline-first (the stored copy renders
/// instantly; a server refresh reconciles in the background), sequential
/// unlocking, prefetch-aware play, and the reward loop:
/// play stage → reward screen → back here → next node unlocks.
class WorldMapScreen extends StatefulWidget {
  const WorldMapScreen({super.key, required this.worldId});

  final String worldId;

  @override
  State<WorldMapScreen> createState() => _WorldMapScreenState();
}

class _WorldMapScreenState extends State<WorldMapScreen> {
  World? _world;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final store = await WorldStore.instance();
    final local = await store.get(widget.worldId);
    if (local != null && mounted) setState(() => _world = local);
    // Background reconcile — offline quietly keeps the local copy.
    if (Session.instance.registered) {
      try {
        final remote = World.fromMap(await Api.worldState(widget.worldId));
        final merged = await store.save(remote);
        if (mounted) setState(() => _world = merged);
      } catch (_) {/* offline — local copy stands */}
    }
  }

  Future<void> _openStage(WorldStage stage) async {
    if (_busy || _world == null) return;
    _busy = true;
    try {
      final store = await WorldStore.instance();

      // 1. The spec: offline copy first, then the network (which also
      //    prefetches the NEXT stage server-side), then the building screen.
      Map<String, dynamic>? spec = await store.stageSpec(widget.worldId, stage.index);
      if (spec == null) {
        try {
          spec = await Api.stageSpecOnce(widget.worldId, stage.index);
        } catch (_) {
          spec = null;
        }
        if (spec == null) {
          if (!mounted) return;
          spec = await Navigator.of(context).push<Map<String, dynamic>>(
            MaterialPageRoute(
              builder: (_) => BuildingStageScreen(
                worldId: widget.worldId,
                stageIndex: stage.index,
              ),
            ),
          );
        }
        if (spec == null) return; // child backed out / generation failed
        await store.saveStageSpec(widget.worldId, stage.index, spec);
      } else {
        // Cached copy plays instantly; still nudge the server prefetch.
        // (Fire and forget — offline is fine.)
        // ignore: unawaited_futures
        Api.stageSpecOnce(widget.worldId, stage.index).catchError((_) => null);
      }

      // 2. Play.
      if (!mounted) return;
      final result = await Navigator.of(context).push<Map<String, dynamic>>(
        MaterialPageRoute(
          builder: (_) => PlayerScreen(
            launch: PlayerLaunch.stage(
              worldId: widget.worldId,
              stageIndex: stage.index,
              fullSpec: spec!,
            ),
          ),
        ),
      );
      final summary = result?['summary'] as Map<String, dynamic>?;
      if (summary == null) {
        await _load();
        return; // quit mid-stage — nothing to record
      }

      // 3. Record: server-first, local always.
      final accuracy = ((summary['accuracy'] as num?) ?? 0).toDouble().clamp(0.0, 1.0);
      var stars = accuracy >= 0.85 ? 3 : (accuracy >= 0.55 ? 2 : 1);
      int xpAwarded = ((summary['xp'] as num?) ?? 0).toInt();
      int? streakCount;
      String? headline;
      if (Session.instance.registered) {
        try {
          final res = await Api.postStageSession(widget.worldId, stage.index, summary);
          stars = (res['stars'] as num?)?.toInt() ?? stars;
          xpAwarded = (res['xpAwarded'] as num?)?.toInt() ?? xpAwarded;
          streakCount = ((res['streak'] as Map?)?['count'] as num?)?.toInt();
          headline = (res['enrichedFeedback'] as Map?)?['headline'] as String?;
        } catch (_) {
          // Offline: queue the summary on the stage's saved-game row.
          await _queueOfflineSummary(stage.index, summary);
        }
      }
      await store.recordStageResult(widget.worldId, stage.index,
          stars: stars, accuracy: accuracy);
      final xp = await XpStore.instance();
      await xp.addLocal(xpAwarded, streakCount: streakCount);

      // 4. Reward moment, then the map re-renders with the next node unlocked
      //    and the world one element more alive.
      final refreshed = await store.get(widget.worldId);
      final finished = refreshed?.finished ?? false;
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => StageRewardScreen(
            stars: stars,
            xpAwarded: xpAwarded,
            streakCount: streakCount,
            feedbackHeadline: headline,
            worldFinished: finished,
          ),
        ),
      );
      await _load();
      // ignore: unawaited_futures
      xp.refresh();
    } finally {
      _busy = false;
    }
  }

  /// Offline: park the summary on the stage's SavedGame row — the same
  /// pending-summary sync that serves classic replays picks it up later.
  Future<void> _queueOfflineSummary(int index, Map<String, dynamic> summary) async {
    try {
      await GameStore.instance.updateStats(
        WorldStore.stageGameId(widget.worldId, index),
        pendingSummaryJson: jsonEncode(summary),
      );
    } catch (_) {/* the local stage result below still records the run */}
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final world = _world;
    if (world == null) {
      return const Scaffold(
        backgroundColor: Palette.dark,
        body: Center(child: Mascot(expression: MascotExpression.thinking)),
      );
    }
    final states = worldNodeStates(world.stages);

    return Scaffold(
      backgroundColor: Palette.dark,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Palette.soft,
        title: Text(world.title,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          children: [
            if (world.arcIntro != null && world.completedCount == 0)
              Container(
                padding: const EdgeInsets.all(14),
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Palette.card,
                  borderRadius: BorderRadius.circular(Palette.radiusCard),
                  border: Border.all(color: Palette.cardBorder),
                ),
                child: Text(
                  world.arcIntro!,
                  style: const TextStyle(color: Palette.soft, fontSize: 15, height: 1.5),
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: world.stageCount == 0
                          ? 0
                          : world.completedCount / world.stageCount,
                      minHeight: 10,
                      backgroundColor: Palette.card,
                      color: Palette.yellow,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  l.translateWith('world_progress', {
                    'done': '${world.completedCount}',
                    'total': '${world.stageCount}',
                  }),
                  style: const TextStyle(color: Palette.grey, fontSize: 13),
                ),
              ],
            ),
            const SizedBox(height: 8),
            StageTrail(
              worldId: world.id,
              subject: world.subject,
              stages: world.stages,
              states: states,
              onOpen: _openStage,
            ),
            if (world.finished && world.arcOutro != null)
              Container(
                padding: const EdgeInsets.all(16),
                margin: const EdgeInsets.only(top: 6, bottom: 20),
                decoration: BoxDecoration(
                  color: Palette.card,
                  borderRadius: BorderRadius.circular(Palette.radiusCard),
                  border: Border.all(color: Palette.yellow, width: 2),
                ),
                child: Column(
                  children: [
                    const Mascot(
                        expression: MascotExpression.celebrating, size: 88),
                    const SizedBox(height: 8),
                    Text(l.translate('world_complete'),
                        style: const TextStyle(
                            color: Palette.yellow,
                            fontSize: 18,
                            fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    // the whole journey's stars, side by side — earned, kept
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.star_rounded,
                            color: Palette.yellow, size: 26),
                        const SizedBox(width: 5),
                        Text(
                          '${world.stages.fold<int>(0, (s, st) => s + (st.stars ?? 0))}'
                          ' / ${world.stageCount * 3}',
                          style: const TextStyle(
                              color: Palette.soft,
                              fontSize: 17,
                              fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(world.arcOutro!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Palette.soft, fontSize: 15, height: 1.5)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The weak-internet fallback: a warm themed building moment that polls the
/// stage spec (the server is generating it right now) and returns it when
/// ready. Backing out returns null.
class BuildingStageScreen extends StatefulWidget {
  const BuildingStageScreen({
    super.key,
    required this.worldId,
    required this.stageIndex,
  });

  final String worldId;
  final int stageIndex;

  @override
  State<BuildingStageScreen> createState() => _BuildingStageScreenState();
}

class _BuildingStageScreenState extends State<BuildingStageScreen> {
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    try {
      // Belt-and-braces: make sure a job is actually running (a failed or
      // never-kicked stage self-heals here), then poll.
      try {
        await Api.kickStage(widget.worldId, widget.stageIndex);
      } catch (_) {}
      final spec = await Api.waitForStageSpec(widget.worldId, widget.stageIndex);
      if (mounted) Navigator.of(context).pop(spec);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Palette.dark,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Mascot(
                expression:
                    _failed ? MascotExpression.sad : MascotExpression.thinking,
                size: 130,
              ),
              const SizedBox(height: 18),
              Text(
                _failed
                    ? l.translate('world_stage_failed')
                    : l.translate('world_stage_building'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Palette.soft,
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 20),
              if (!_failed)
                const SizedBox(
                  width: 40,
                  height: 40,
                  child: CircularProgressIndicator(color: Palette.yellow, strokeWidth: 3),
                )
              else
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: Palette.green),
                  onPressed: () {
                    setState(() => _failed = false);
                    _run();
                  },
                  child: Text(l.translate('stage_retry')),
                ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(l.translate('not_now'),
                    style: const TextStyle(color: Palette.grey)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
