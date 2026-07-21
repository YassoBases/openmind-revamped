/// Local-first persistence for Lesson Worlds.
///
/// World metadata + map state (small JSON) live in SharedPreferences; fetched
/// stage SPECS (the ~30KB payloads) ride the existing Drift/IndexedDB
/// [GameStore] as SavedGame rows with the reserved id `world:{worldId}:{n}` —
/// so every played stage replays offline at $0, without a second database.
///
/// Doctrine (mirrors LearnProgressStore): progress is sacred — merges only
/// ever improve (max of stars/accuracy, completion never un-completes), and
/// a server refresh never erases a local completion recorded offline.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/game_store.dart';
import 'world_models.dart';

class WorldStore {
  WorldStore._(this._prefs);

  static WorldStore? _instance;
  static Future<WorldStore> instance() async =>
      _instance ??= WorldStore._(await SharedPreferences.getInstance());

  /// Test seam.
  @visibleForTesting
  static void reset([WorldStore? replacement]) => _instance = replacement;

  final SharedPreferences _prefs;

  /// Bumped on every write so kept-alive screens can live-refresh.
  final ValueNotifier<int> revision = ValueNotifier(0);

  static const _indexKey = 'worlds.index';
  static String _worldKey(String id) => 'worlds.world.$id';
  static String stageGameId(String worldId, int index) => 'world:$worldId:$index';
  static bool isStageGameId(String id) => id.startsWith('world:');

  List<String> get _ids => _prefs.getStringList(_indexKey) ?? const [];

  Future<List<World>> list() async {
    final worlds = <World>[];
    for (final id in _ids) {
      final raw = _prefs.getString(_worldKey(id));
      if (raw == null) continue;
      try {
        worlds.add(World.fromMap(jsonDecode(raw) as Map<String, dynamic>));
      } catch (_) {/* a corrupt row never breaks the shelf */}
    }
    worlds.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return worlds;
  }

  Future<World?> get(String id) async {
    final raw = _prefs.getString(_worldKey(id));
    if (raw == null) return null;
    try {
      return World.fromMap(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  /// Save/refresh a world's map state. Progress merges only ever improve:
  /// server rows never lower local stars or un-complete local completions
  /// (offline runs report later).
  Future<World> save(World incoming) async {
    final existing = await get(incoming.id);
    var merged = incoming;
    if (existing != null) {
      final mergedStages = incoming.stages.map((s) {
        final local = existing.stages.where((e) => e.index == s.index).firstOrNull;
        if (local == null) return s;
        return WorldStage(
          index: s.index,
          status: s.status,
          error: s.error,
          stars: _maxOf(s.stars, local.stars),
          bestAccuracy: _maxOfD(s.bestAccuracy, local.bestAccuracy),
          completedAt: s.completedAt ?? local.completedAt,
          focus: s.focus ?? local.focus,
          beat: s.beat ?? local.beat,
          gameType: s.gameType ?? local.gameType,
          variant: s.variant ?? local.variant,
          theme: s.theme ?? local.theme,
          kit: s.kit ?? local.kit,
          learningLevel: s.learningLevel ?? local.learningLevel,
          ramp: s.ramp ?? local.ramp,
        );
      }).toList();
      merged = World(
        id: incoming.id,
        title: incoming.title.isNotEmpty ? incoming.title : existing.title,
        subject: incoming.subject,
        topic: incoming.topic,
        language: incoming.language,
        stageCount: incoming.stageCount,
        stages: mergedStages,
        lessonId: incoming.lessonId ?? existing.lessonId,
        arcIntro: incoming.arcIntro ?? existing.arcIntro,
        arcOutro: incoming.arcOutro ?? existing.arcOutro,
        createdAt: existing.createdAt,
      );
    }
    await _prefs.setString(_worldKey(merged.id), jsonEncode(merged.toMap()));
    if (!_ids.contains(merged.id)) {
      await _prefs.setStringList(_indexKey, [..._ids, merged.id]);
    }
    revision.value++;
    return merged;
  }

  /// Record a finished run locally (works offline; server sync is separate).
  Future<void> recordStageResult(String worldId, int index,
      {required int stars, required double accuracy}) async {
    final world = await get(worldId);
    if (world == null) return;
    final stages = world.stages.map((s) {
      if (s.index != index) return s;
      return WorldStage(
        index: s.index,
        status: s.status,
        error: s.error,
        stars: _maxOf(stars, s.stars),
        bestAccuracy: _maxOfD(accuracy, s.bestAccuracy),
        completedAt: s.completedAt ?? DateTime.now(),
        focus: s.focus,
        beat: s.beat,
        gameType: s.gameType,
        variant: s.variant,
        theme: s.theme,
        kit: s.kit,
        learningLevel: s.learningLevel,
        ramp: s.ramp,
      );
    }).toList();
    await _prefs.setString(
        _worldKey(worldId),
        jsonEncode(World(
          id: world.id,
          title: world.title,
          subject: world.subject,
          topic: world.topic,
          language: world.language,
          stageCount: world.stageCount,
          stages: stages,
          lessonId: world.lessonId,
          arcIntro: world.arcIntro,
          arcOutro: world.arcOutro,
          createdAt: world.createdAt,
        ).toMap()));
    revision.value++;
  }

  /// Persist a fetched stage spec for $0 offline replay.
  Future<void> saveStageSpec(String worldId, int index, Map<String, dynamic> spec) async {
    final meta = (spec['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
    await GameStore.instance.save(SavedGame(
      id: stageGameId(worldId, index),
      gameType: (meta['gameType'] as String?) ?? 'quest_path',
      theme: (meta['theme'] as String?) ?? '',
      subject: (meta['subject'] as String?) ?? '',
      topic: (meta['topic'] as String?) ?? '',
      language: (meta['language'] as String?) ?? 'en',
      specJson: jsonEncode(spec),
    ));
  }

  /// The offline copy of a stage spec, if the child has fetched it before.
  Future<Map<String, dynamic>?> stageSpec(String worldId, int index) async {
    final saved = await GameStore.instance.get(stageGameId(worldId, index));
    if (saved == null) return null;
    try {
      return jsonDecode(saved.specJson) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}

int? _maxOf(int? a, int? b) =>
    a == null ? b : (b == null ? a : (a > b ? a : b));
double? _maxOfD(double? a, double? b) =>
    a == null ? b : (b == null ? a : (a > b ? a : b));
