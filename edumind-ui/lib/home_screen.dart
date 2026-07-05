import 'package:edumind/app_localizations.dart';
import 'package:flutter/material.dart';

import 'core/app_theme.dart';
import 'core/palette.dart';
import 'data/game_store.dart';
import 'features/composer/composer_screen.dart';
import 'features/demos/demos_screen.dart';
import 'features/player/player_screen.dart';
import 'widgets/mascot.dart';

/// The learning path — a Duolingo-style winding trail, but every node is a
/// real AI-generated game from the local store. The first node is always
/// "create a game" (opens the composer); the rest are the student's saved
/// games, newest first, each replayable fully offline.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => HomeScreenState();
}

class HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  // The guide mascot bobs above the "create" node to invite the next game.
  late final AnimationController _guide = AnimationController(
    duration: const Duration(milliseconds: 1500),
    vsync: this,
  )..repeat(reverse: true);

  List<SavedGame> _games = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _guide.dispose();
    super.dispose();
  }

  /// Public so the dashboard/root can refresh after a game is created.
  Future<void> reload() => _load();

  Future<void> _load() async {
    final games = await GameStore.instance.list();
    if (mounted) {
      setState(() {
        _games = games;
        _loading = false;
      });
    }
  }

  Future<void> _createGame() async {
    final feedback = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => const ComposerScreen()),
    );
    if (!mounted) return;
    // A freshly generated game is saved on completion; refresh either way.
    await _load();
    _maybeShowFeedback(feedback);
  }

  Future<void> _playGame(SavedGame game) async {
    final feedback = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(
        builder: (_) => PlayerScreen(launch: PlayerLaunch.replay(game)),
      ),
    );
    if (!mounted) return;
    await _load();
    _maybeShowFeedback(feedback);
  }

  Future<void> _openDemos() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => const DemosScreen()),
    );
    if (mounted) await _load();
  }

  void _maybeShowFeedback(Map<String, dynamic>? feedback) {
    if (feedback == null || feedback['headline'] == null) return;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Row(
          children: [
            const Mascot(
              size: 48,
              character: MascotCharacter.bee,
              expression: MascotExpression.celebrating,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(feedback['headline'] as String)),
          ],
        ),
        content: Text((feedback['body'] as String?) ?? ''),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(AppLocalizations.of(ctx)!.translate('play')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          _background(),
          Positioned.fill(
            child: SafeArea(
              child: Column(
                children: [
                  _headerStats(),
                  Expanded(
                    child: _loading
                        ? const Center(child: CircularProgressIndicator())
                        : SingleChildScrollView(
                            padding: const EdgeInsets.symmetric(
                              vertical: 32,
                              horizontal: 20,
                            ),
                            child: _buildPath(),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _background() => Positioned.fill(
    child: Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.ivory, AppColors.softBlue, AppColors.cream],
        ),
      ),
    ),
  );

  Widget _headerStats() {
    final cs = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    // Simple local progress until server stats are wired (M4): a "level" per
    // five games, points = sum of best scores.
    final points = _games.fold<int>(0, (sum, g) => sum + g.bestScore);
    final level = 1 + (_games.length ~/ 5);
    Widget pill(Widget child) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(30),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          pill(
            Row(
              children: [
                Icon(Icons.stars_rounded, color: cs.secondary, size: 22),
                const SizedBox(width: 8),
                Text(
                  '${l.translate('level_label')} $level',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: cs.secondary,
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: _openDemos,
            child: pill(
              Row(
                children: [
                  Icon(
                    Icons.sports_esports_rounded,
                    color: cs.primary,
                    size: 21,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    l.translate('demo_games_short'),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: cs.primary,
                    ),
                  ),
                ],
              ),
            ),
          ),
          pill(
            Row(
              children: [
                Text(
                  '$points ${l.translate('points_label')}',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: cs.primary,
                  ),
                ),
                const SizedBox(width: 6),
                const Mascot(
                  size: 46,
                  character: MascotCharacter.bee,
                  expression: MascotExpression.happy,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPath() {
    final children = <Widget>[];
    // Newest games near the top, the create node leads the trail.
    for (var i = 0; i < _games.length; i++) {
      final alignStart = i.isEven;
      children.add(_gameNode(_games[i], alignStart));
      children.add(_pathLine(isStart: alignStart));
    }
    if (_games.isEmpty) {
      children.add(const SizedBox(height: 90));
    }
    // The create node is always last in the column (visually the "next step").
    children.add(_createNode(alignStart: _games.length.isEven));
    return Column(children: children);
  }

  Widget _createNode({required bool alignStart}) {
    final cs = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final label = _games.isEmpty
        ? l.translate('create_first_game')
        : l.translate('create_game');
    return Stack(
      clipBehavior: Clip.none,
      alignment: alignStart
          ? AlignmentDirectional.centerStart
          : AlignmentDirectional.centerEnd,
      children: [
        Align(
          alignment: alignStart
              ? AlignmentDirectional.centerStart
              : AlignmentDirectional.centerEnd,
          child: GestureDetector(
            onTap: _createGame,
            child: Column(
              children: [
                Container(
                  width: 84,
                  height: 84,
                  decoration: BoxDecoration(
                    color: cs.secondary,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 4),
                    boxShadow: [
                      BoxShadow(
                        color: cs.secondary.withValues(alpha: 0.5),
                        blurRadius: 16,
                        spreadRadius: 3,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.add_rounded,
                    color: Colors.white,
                    size: 44,
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: 120,
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: cs.primary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        // The guide mascot bobs above, pointing at the create node.
        PositionedDirectional(
          top: -118,
          start: alignStart ? 30 : null,
          end: alignStart ? null : 30,
          child: AnimatedBuilder(
            animation: _guide,
            builder: (context, child) => Transform.translate(
              offset: Offset(0, _guide.value * -12),
              child: child,
            ),
            child: Column(
              children: [
                const Mascot(size: 96, expression: MascotExpression.happy),
                Text(
                  l.translate('tap_to_play'),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: cs.secondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _gameNode(SavedGame game, bool alignStart) {
    final cs = Theme.of(context).colorScheme;
    final emoji = kGameTypeEmoji[game.gameType] ?? '🎮';
    final color = game.bestScore >= 80
        ? cs.primary
        : game.bestScore > 0
        ? cs.secondary
        : cs.tertiary;
    return Align(
      alignment: alignStart
          ? AlignmentDirectional.centerStart
          : AlignmentDirectional.centerEnd,
      child: GestureDetector(
        onTap: () => _playGame(game),
        child: Column(
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 4),
                boxShadow: [
                  BoxShadow(
                    color: color.withValues(alpha: 0.45),
                    blurRadius: 10,
                    spreadRadius: 1,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Center(
                child: Text(emoji, style: const TextStyle(fontSize: 34)),
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: 130,
              child: Text(
                game.topic,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
            ),
            if (game.bestScore > 0)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  '⭐ ${game.bestScore}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: cs.secondary,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _pathLine({required bool isStart}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 50),
      child: Align(
        alignment: isStart
            ? AlignmentDirectional.centerStart
            : AlignmentDirectional.centerEnd,
        child: SizedBox(
          width: 120,
          height: 40,
          child: CustomPaint(painter: _DottedPathPainter(isStart: isStart)),
        ),
      ),
    );
  }
}

/// The winding connector between two path nodes.
class _DottedPathPainter extends CustomPainter {
  _DottedPathPainter({required this.isStart});
  final bool isStart;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.orange.withValues(alpha: 0.4)
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke;
    final path = Path();
    if (isStart) {
      path.moveTo(0, 0);
      path.quadraticBezierTo(
        size.width * 0.5,
        size.height * 0.5,
        size.width,
        size.height,
      );
    } else {
      path.moveTo(size.width, 0);
      path.quadraticBezierTo(
        size.width * 0.5,
        size.height * 0.5,
        0,
        size.height,
      );
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _DottedPathPainter old) =>
      old.isStart != isStart;
}
