import 'dart:convert';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../core/spec_assembler.dart';
import '../../data/game_store.dart';
import '../../widgets/mascot.dart';
import 'shell_controller.dart';
import 'shell_player_io.dart'
    if (dart.library.js_interop) 'shell_player_web.dart';

/// How a game reaches the player:
///  - generated: stub spec now, full spec hot-loads when the server finishes
///  - replay:    saved spec from the offline store (zero network)
///  - demo:      bundled sample spec (zero network, zero account)
///  - review:    synthesized spec from /review/today
///  - stage:     one Lesson-Worlds stage — the WORLD MAP owns the session
///               recording/rewards; the player just plays and pops the summary
enum PlayerMode { generated, replay, demo, review, stage }

class PlayerLaunch {
  PlayerLaunch.generated({
    required this.gameId,
    required Map<String, dynamic> this.stubSpec,
  }) : mode = PlayerMode.generated,
       fullSpec = null,
       saved = null,
       worldId = null,
       stageIndex = null;
  PlayerLaunch.replay(SavedGame this.saved)
    : mode = PlayerMode.replay,
      gameId = saved.id,
      stubSpec = null,
      fullSpec = jsonDecode(saved.specJson) as Map<String, dynamic>,
      worldId = null,
      stageIndex = null;
  PlayerLaunch.demo(Map<String, dynamic> this.fullSpec)
    : mode = PlayerMode.demo,
      gameId = null,
      stubSpec = null,
      saved = null,
      worldId = null,
      stageIndex = null;
  PlayerLaunch.review(Map<String, dynamic> this.fullSpec)
    : mode = PlayerMode.review,
      gameId = null,
      stubSpec = null,
      saved = null,
      worldId = null,
      stageIndex = null;
  PlayerLaunch.stage({
    required String this.worldId,
    required int this.stageIndex,
    required Map<String, dynamic> this.fullSpec,
  }) : mode = PlayerMode.stage,
       gameId = null,
       stubSpec = null,
       saved = null;

  final PlayerMode mode;
  final String? gameId;
  final Map<String, dynamic>? stubSpec;
  final Map<String, dynamic>? fullSpec;
  final SavedGame? saved;
  final String? worldId;
  final int? stageIndex;

  String get gameType =>
      ((fullSpec ?? stubSpec)!['meta'] as Map<String, dynamic>)['gameType']
          as String;
}

class PlayerScreen extends StatefulWidget {
  const PlayerScreen({super.key, required this.launch});
  final PlayerLaunch launch;

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  final _controller = ShellController();
  String? _html;
  Map<String, dynamic>? _spec; // full spec, once known
  Map<String, dynamic>? _summary; // last reportSummary payload
  bool _generating = false;
  bool _saved = false;

  PlayerLaunch get launch => widget.launch;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final initial = launch.fullSpec ?? launch.stubSpec!;
    _spec = launch.fullSpec;
    final html = await SpecAssembler.assemble(launch.gameType, initial);
    setState(() {
      _html = html;
      _generating = launch.mode == PlayerMode.generated;
    });
    if (launch.mode == PlayerMode.generated) _pollSpec();
  }

  Future<void> _pollSpec() async {
    try {
      final spec = await Api.waitForSpec(launch.gameId!);
      _spec = spec;
      await _controller.sendSpec(spec);
      // Save as soon as it's generated so it appears on the home path even if
      // the child closes before finishing; completion later updates the stats.
      await _persistGenerated();
      if (mounted) setState(() => _generating = false);
    } catch (_) {
      if (mounted) setState(() => _generating = false);
      await _controller.generationFailed();
    }
  }

  Future<void> _retry() async {
    try {
      await Api.post('/api/v1/games/${launch.gameId}/retry');
      setState(() => _generating = true);
      await _pollSpec();
    } catch (_) {
      await _controller.generationFailed();
    }
  }

  void _onBridge(Map<String, dynamic> msg) {
    final type = msg['type'] as String?;
    final payload = (msg['payload'] as Map?)?.map(
      (k, v) => MapEntry(k.toString(), v),
    );
    switch (type) {
      case 'reportSummary':
        _summary = payload;
      case 'reportComplete':
        _finish();
      case 'reportEvent':
        if (payload?['name'] == 'retry_requested' &&
            launch.mode == PlayerMode.generated) {
          _retry();
        }
      default:
        break;
    }
  }

  Future<void> _finish() async {
    Map<String, dynamic>? feedback;
    final summary = _summary;

    // Lesson-Worlds stages: the world map owns recording, stars, XP and the
    // reward screen — the player just hands the summary back.
    if (launch.mode == PlayerMode.stage) {
      if (!mounted) return;
      Navigator.of(context).pop(summary == null ? null : {'summary': summary});
      return;
    }

    // 1. record the session server-side (offline replays queue it locally)
    if (summary != null && launch.mode != PlayerMode.demo) {
      try {
        final path = launch.mode == PlayerMode.review
            ? '/api/v1/review/sessions'
            : '/api/v1/games/${launch.gameId}/sessions';
        if (Session.instance.registered) {
          final res =
              await Api.post(path, {'summary': summary})
                  as Map<String, dynamic>;
          feedback = res['enrichedFeedback'] as Map<String, dynamic>?;
        }
      } catch (_) {
        if (launch.mode == PlayerMode.replay && launch.saved != null) {
          await GameStore.instance.updateStats(
            launch.saved!.id,
            pendingSummaryJson: jsonEncode(summary),
          ); // sync later
        }
      }
    }

    // 2. record the play: the generated game was already saved on generation,
    // so completion just bumps best score + play count (same for replays).
    final id = launch.gameId ?? launch.saved?.id;
    if (id != null &&
        (launch.mode == PlayerMode.generated ||
            launch.mode == PlayerMode.replay)) {
      await _persistGenerated(); // no-op if already saved (e.g. failed mid-generation)
      await GameStore.instance.updateStats(
        id,
        bestScore: (((summary?['accuracy'] as num?) ?? 0) * 100).round(),
        played: true,
      );
    }

    // Finishing must never feel dead: when the server gave no enriched
    // feedback (demos, offline, unregistered), fall back to a warm local
    // celebration built from the child's own result — Home shows it as a
    // dialog, so every completed game lands with a moment of "well done".
    feedback ??= _localCelebration(summary);

    if (!mounted) return;
    Navigator.of(context).pop(feedback);
  }

  /// A warm, result-shaped celebration for when no server feedback exists.
  /// Built from the child's own accuracy so it feels earned, not canned.
  Map<String, dynamic>? _localCelebration(Map<String, dynamic>? summary) {
    if (summary == null) return null;
    final name = (Session.instance.profile?['name'] as String?)?.trim() ?? '';
    final who = name.isEmpty ? '' : ' $name';
    final acc = ((summary['accuracy'] as num?) ?? 0).toDouble();
    final ar = Session.instance.language == 'ar';
    final topic = _spec?['meta']?['topic'] as String?;
    final String headline;
    final String body;
    if (acc >= 0.85) {
      headline = ar ? '🌟 عمل رائع$who!' : '🌟 Amazing$who!';
      body = ar
          ? 'أتقنت هذه اللعبة! ${topic != null ? 'أنت بطل $topic.' : ''}'
          : 'You mastered this one!${topic != null ? ' A real $topic champion.' : ''}';
    } else if (acc >= 0.5) {
      headline = ar ? '👏 أحسنت$who!' : '👏 Well done$who!';
      body = ar
          ? 'تقدّم رائع — العب مرة أخرى لتصل إلى النجوم الثلاث!'
          : 'Great progress — play again to reach all three stars!';
    } else {
      headline = ar ? '💪 محاولة جيدة$who!' : '💪 Good try$who!';
      body = ar
          ? 'كل محاولة تجعلك أقوى. لنلعب مرة أخرى!'
          : 'Every try makes you stronger. Let\'s play again!';
    }
    return {'headline': headline, 'body': body, 'reviewSuggestions': const <String>[]};
  }

  /// Save a freshly generated game for offline replay. Idempotent via [_saved].
  Future<void> _persistGenerated() async {
    if (launch.mode != PlayerMode.generated || _spec == null || _saved) return;
    _saved = true;
    try {
      String? thumb;
      try {
        thumb =
            (await Api.gameStatus(launch.gameId!))['thumbnailUrl'] as String?;
      } catch (_) {
        /* thumbnail is optional */
      }
      final meta = _spec!['meta'] as Map<String, dynamic>;
      await GameStore.instance.save(
        SavedGame(
          id: launch.gameId!,
          gameType: meta['gameType'] as String,
          theme: meta['theme'] as String,
          subject: (meta['subject'] as String?) ?? '',
          topic: (meta['topic'] as String?) ?? '',
          language: (meta['language'] as String?) ?? 'en',
          specJson: jsonEncode(_spec),
          thumbnailUrl: thumb,
        ),
      );
    } catch (_) {
      _saved = false; // allow a later retry (e.g. on completion)
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Palette.dark,
      body: Stack(
        children: [
          Column(
            children: [
              SafeArea(
                bottom: false,
                child: SizedBox(
                  height: 48,
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: IconButton(
                      icon: const Icon(
                        Icons.close_rounded,
                        color: Palette.grey,
                        size: 26,
                      ),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: _html == null
                    ? const Center(
                        child: Mascot(expression: MascotExpression.thinking),
                      )
                    : ShellPlayer(
                        html: _html!,
                        onBridge: _onBridge,
                        controller: _controller,
                      ),
              ),
            ],
          ),
          if (_generating)
            SafeArea(
              child: Align(
                alignment: Alignment.topCenter,
                child: Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Palette.card.withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Palette.cardBorder),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Palette.blue,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        tr(context, 'generating'),
                        style: const TextStyle(
                          color: Palette.soft,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
