import 'dart:convert';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../core/spec_assembler.dart';
import '../../data/game_store.dart';
import '../../widgets/mascot.dart';
import 'shell_controller.dart';
import 'shell_player_io.dart' if (dart.library.js_interop) 'shell_player_web.dart';

/// How a game reaches the player:
///  - generated: stub spec now, full spec hot-loads when the server finishes
///  - replay:    saved spec from the offline store (zero network)
///  - demo:      bundled sample spec (zero network, zero account)
///  - review:    synthesized spec from /review/today
enum PlayerMode { generated, replay, demo, review }

class PlayerLaunch {
  PlayerLaunch.generated({required this.gameId, required Map<String, dynamic> this.stubSpec})
      : mode = PlayerMode.generated, fullSpec = null, saved = null;
  PlayerLaunch.replay(SavedGame this.saved)
      : mode = PlayerMode.replay,
        gameId = saved.id,
        stubSpec = null,
        fullSpec = jsonDecode(saved.specJson) as Map<String, dynamic>;
  PlayerLaunch.demo(Map<String, dynamic> this.fullSpec)
      : mode = PlayerMode.demo, gameId = null, stubSpec = null, saved = null;
  PlayerLaunch.review(Map<String, dynamic> this.fullSpec)
      : mode = PlayerMode.review, gameId = null, stubSpec = null, saved = null;

  final PlayerMode mode;
  final String? gameId;
  final Map<String, dynamic>? stubSpec;
  final Map<String, dynamic>? fullSpec;
  final SavedGame? saved;

  String get gameType =>
      ((fullSpec ?? stubSpec)!['meta'] as Map<String, dynamic>)['gameType'] as String;
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
    final payload = (msg['payload'] as Map?)?.map((k, v) => MapEntry(k.toString(), v));
    switch (type) {
      case 'reportSummary':
        _summary = payload;
      case 'reportComplete':
        _finish();
      case 'reportEvent':
        if (payload?['name'] == 'retry_requested' && launch.mode == PlayerMode.generated) {
          _retry();
        }
      default:
        break;
    }
  }

  Future<void> _finish() async {
    Map<String, dynamic>? feedback;
    final summary = _summary;

    // 1. record the session server-side (offline replays queue it locally)
    if (summary != null && launch.mode != PlayerMode.demo) {
      try {
        final path = launch.mode == PlayerMode.review
            ? '/api/v1/review/sessions'
            : '/api/v1/games/${launch.gameId}/sessions';
        if (Session.instance.registered) {
          final res = await Api.post(path, {'summary': summary}) as Map<String, dynamic>;
          feedback = res['enrichedFeedback'] as Map<String, dynamic>?;
        }
      } catch (_) {
        if (launch.mode == PlayerMode.replay && launch.saved != null) {
          await GameStore.instance.updateStats(launch.saved!.id,
              pendingSummaryJson: jsonEncode(summary)); // sync later
        }
      }
    }

    // 2. persist the generated game for offline replay
    if (launch.mode == PlayerMode.generated && _spec != null && !_saved) {
      _saved = true;
      try {
        final status = await Api.gameStatus(launch.gameId!);
        final meta = _spec!['meta'] as Map<String, dynamic>;
        await GameStore.instance.save(SavedGame(
          id: launch.gameId!,
          gameType: meta['gameType'] as String,
          theme: meta['theme'] as String,
          subject: meta['subject'] as String,
          topic: meta['topic'] as String,
          language: meta['language'] as String,
          specJson: jsonEncode(_spec),
          thumbnailUrl: status['thumbnailUrl'] as String?,
          bestScore: (((summary?['accuracy'] as num?) ?? 0) * 100).round(),
          playCount: 1,
        ));
      } catch (_) {/* keep playing even if save fails */}
    } else if (launch.mode == PlayerMode.replay && launch.saved != null) {
      await GameStore.instance.updateStats(launch.saved!.id,
          bestScore: (((summary?['accuracy'] as num?) ?? 0) * 100).round(), played: true);
    }

    if (!mounted) return;
    Navigator.of(context).pop(feedback);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Palette.dark,
      body: Stack(children: [
        if (_html == null)
          const Center(child: Mascot(expression: MascotExpression.thinking))
        else
          Positioned.fill(
            child: ShellPlayer(html: _html!, onBridge: _onBridge, controller: _controller),
          ),
        SafeArea(
          child: Align(
            alignment: AlignmentDirectional.topStart,
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: IconButton(
                icon: const Icon(Icons.close_rounded, color: Palette.grey, size: 26),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ),
        ),
        if (_generating)
          SafeArea(
            child: Align(
              alignment: Alignment.topCenter,
              child: Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: Palette.card.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Palette.cardBorder),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const SizedBox(
                    width: 14, height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Palette.blue),
                  ),
                  const SizedBox(width: 8),
                  Text(tr(context, 'generating'),
                      style: const TextStyle(color: Palette.soft, fontSize: 13)),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}
