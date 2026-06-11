import 'dart:convert';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../data/game_store.dart';
import '../../widgets/candy_button.dart';
import '../../widgets/mascot.dart';
import '../../widgets/stat_widgets.dart';
import '../composer/composer_screen.dart';
import '../player/player_screen.dart';

/// The library: locally saved games (specs in Drift/IndexedDB) — tap to
/// replay instantly, fully offline. Server metadata merges in when online.
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, this.onChanged, this.afterPlay});
  final VoidCallback? onChanged;
  final void Function(Map<String, dynamic>? feedback)? afterPlay;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  List<SavedGame> _games = [];
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final games = await GameStore.instance.list();
    if (mounted) {
      setState(() {
        _games = games;
        _loaded = true;
      });
    }
  }

  Future<void> _delete(SavedGame g) async {
    await GameStore.instance.delete(g.id);
    if (Session.instance.registered) {
      try {
        await Api.delete('/api/v1/games/${g.id}');
      } catch (_) {/* offline — server copy stays; local removal is what matters */}
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(tr(context, 'deleted'))));
    _load();
    widget.onChanged?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) {
      return const Center(child: CircularProgressIndicator(color: Palette.green));
    }
    if (_games.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Mascot(size: 130, accent: hexToColor(Session.instance.color)),
            const SizedBox(height: 16),
            Text(tr(context, 'emptyLibrary'),
                style: const TextStyle(
                    color: Palette.soft, fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(tr(context, 'emptyLibrarySub'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: Palette.grey)),
            const SizedBox(height: 22),
            CandyButton(
              label: tr(context, 'createGame'),
              color: hexToColor(Session.instance.color),
              icon: Icons.add_rounded,
              onTap: () async {
                final feedback = await Navigator.push<Map<String, dynamic>>(
                    context, MaterialPageRoute(builder: (_) => const ComposerScreen()));
                widget.afterPlay?.call(feedback);
                _load();
              },
            ),
          ]),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(20),
        itemCount: _games.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) => GameTile(
          game: _games[i],
          afterPlay: (f) {
            widget.afterPlay?.call(f);
            _load();
          },
          onDelete: () => _delete(_games[i]),
        ),
      ),
    );
  }
}

/// One saved game row: thumbnail, topic, best score, instant offline replay.
class GameTile extends StatelessWidget {
  const GameTile({super.key, required this.game, this.afterPlay, this.onDelete});
  final SavedGame game;
  final void Function(Map<String, dynamic>? feedback)? afterPlay;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final thumb = game.thumbnailUrl;
    return EduCard(
      onTap: () async {
        final feedback = await Navigator.push<Map<String, dynamic>>(
          context,
          MaterialPageRoute(builder: (_) => PlayerScreen(launch: PlayerLaunch.replay(game))),
        );
        afterPlay?.call(feedback);
      },
      child: Row(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 64,
            height: 44,
            child: thumb != null && thumb.startsWith('data:image/svg')
                ? _SvgDataThumb(uri: thumb, fallback: kGameTypeEmoji[game.gameType] ?? '🎲')
                : thumb != null && thumb.startsWith('http')
                    ? Image.network(thumb, fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => _emoji())
                    : _emoji(),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(game.topic,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textDirection: game.language == 'ar' ? TextDirection.rtl : TextDirection.ltr,
                style: const TextStyle(
                    color: Palette.soft, fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 3),
            Text(
              '${kThemeEmoji[game.theme] ?? ''} ${game.subject} • ${tr(context, 'bestScore')} ${game.bestScore}%',
              style: const TextStyle(color: Palette.grey, fontSize: 12),
            ),
          ]),
        ),
        if (onDelete != null)
          IconButton(
            icon: const Icon(Icons.delete_outline_rounded, color: Palette.grey, size: 20),
            onPressed: onDelete,
          ),
        const Icon(Icons.play_circle_fill_rounded, color: Palette.green, size: 32),
      ]),
    );
  }

  Widget _emoji() => Container(
        color: Palette.cardBorder,
        alignment: Alignment.center,
        child: Text(kGameTypeEmoji[game.gameType] ?? '🎲', style: const TextStyle(fontSize: 22)),
      );
}

/// Renders the backend's programmatic SVG data-URI thumbnails without an svg
/// dependency: falls back to a colored emoji card (the SVG is decorative).
class _SvgDataThumb extends StatelessWidget {
  const _SvgDataThumb({required this.uri, required this.fallback});
  final String uri;
  final String fallback;

  @override
  Widget build(BuildContext context) {
    // Extract the bg fill from the generated SVG for a faithful tile color.
    Color bg = Palette.cardBorder;
    try {
      final svg = utf8.decode(base64Decode(uri.split(',').last));
      final m = RegExp('rx="16" fill="(#[0-9a-fA-F]{6})"').firstMatch(svg);
      if (m != null) bg = hexToColor(m.group(1)!);
    } catch (_) {}
    return Container(
      color: bg,
      alignment: Alignment.center,
      child: Text(fallback, style: const TextStyle(fontSize: 22)),
    );
  }
}
