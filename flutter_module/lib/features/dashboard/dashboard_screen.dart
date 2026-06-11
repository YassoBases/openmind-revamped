import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../data/game_store.dart';
import '../../widgets/candy_button.dart';
import '../../widgets/mascot.dart';
import '../../widgets/stat_widgets.dart';
import '../composer/composer_screen.dart';
import '../demos/demos_screen.dart';
import '../library/library_screen.dart';
import '../player/player_screen.dart';
import '../profile/profile_screen.dart';
import '../settings/settings_screen.dart';

/// Home: XP bar, streak flame, daily-goal ring, Review tile, recent games,
/// and the big NEW GAME button. Bottom nav: home / library / profile.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _tab = 0;
  Map<String, dynamic>? _stats;
  List<SavedGame> _recent = [];
  bool _online = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final recent = await GameStore.instance.list();
    if (mounted) setState(() => _recent = recent.take(3).toList());
    if (!Session.instance.registered) return;
    try {
      await Api.post('/api/v1/students/me/streak-check');
      final stats = await Api.get('/api/v1/students/me/stats') as Map<String, dynamic>;
      await _syncPending();
      if (mounted) {
        setState(() {
          _stats = stats;
          _online = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _online = false);
    }
  }

  /// Offline replay summaries queued in the store sync on dashboard load.
  Future<void> _syncPending() async {
    for (final g in await GameStore.instance.withPendingSummaries()) {
      try {
        await Api.post('/api/v1/games/${g.id}/sessions', {'summary': g.pendingSummaryJson});
        await GameStore.instance.updateStats(g.id, pendingSummaryJson: null);
      } catch (_) {/* retry next time */}
    }
  }

  Future<void> _playReview() async {
    try {
      final spec = await Api.get('/api/v1/review/today') as Map<String, dynamic>;
      if (!mounted) return;
      final feedback = await Navigator.push<Map<String, dynamic>>(
        context,
        MaterialPageRoute(builder: (_) => PlayerScreen(launch: PlayerLaunch.review(spec))),
      );
      _afterPlay(feedback);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.code == 'NOT_ENOUGH_DATA'
            ? 'Play a few games first to unlock review!'
            : e.message),
      ));
    } catch (_) {/* offline */}
  }

  void _afterPlay(Map<String, dynamic>? feedback) {
    _refresh();
    if (feedback != null && feedback['headline'] != null && mounted) {
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: Palette.card,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Palette.radiusCard)),
          title: Row(children: [
            // post-game feedback = rewards = the bee's moment
            const Mascot(size: 56, expression: MascotExpression.celebrating, character: MascotCharacter.bee),
            const SizedBox(width: 10),
            Expanded(
              child: Text(feedback['headline'] as String,
                  style: const TextStyle(color: Palette.soft, fontSize: 18)),
            ),
          ]),
          content: Text((feedback['body'] as String?) ?? '',
              style: const TextStyle(color: Palette.grey)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final accent = hexToColor(Session.instance.color);
    final body = switch (_tab) {
      1 => LibraryScreen(onChanged: _refresh, afterPlay: _afterPlay),
      2 => const ProfileScreen(),
      _ => _home(accent),
    };
    return Scaffold(
      backgroundColor: Palette.dark,
      body: SafeArea(child: body),
      bottomNavigationBar: NavigationBar(
        backgroundColor: Palette.card,
        indicatorColor: accent.withValues(alpha: 0.25),
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_rounded), label: tr(context, 'dashboard')),
          NavigationDestination(icon: const Icon(Icons.collections_bookmark_rounded), label: tr(context, 'library')),
          NavigationDestination(icon: const Icon(Icons.person_rounded), label: tr(context, 'profile')),
        ],
      ),
    );
  }

  Widget _home(Color accent) {
    final stats = _stats;
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(children: [
            Mascot(size: 64, accent: accent),
            const SizedBox(width: 12),
            Expanded(
              child: Text('${tr(context, 'appName')} • ${Session.instance.name}',
                  style: const TextStyle(
                      color: Palette.soft, fontSize: 19, fontWeight: FontWeight.w800)),
            ),
            StreakFlame(count: (stats?['streakCount'] as num?)?.toInt() ?? 0),
            IconButton(
              icon: const Icon(Icons.settings_rounded, color: Palette.grey),
              onPressed: () async {
                await Navigator.push(
                    context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
                _refresh();
              },
            ),
          ]),
          const SizedBox(height: 12),
          if (!_online && Session.instance.registered)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(tr(context, 'offlineMode'),
                  style: const TextStyle(color: Palette.yellow, fontSize: 12)),
            ),
          EduCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              XpBar(xp: (stats?['xp'] as num?)?.toInt() ?? 0),
              const SizedBox(height: 14),
              Row(children: [
                GoalRing(
                  done: (stats?['todaySessions'] as num?)?.toInt() ?? 0,
                  goal: (stats?['dailyGoal'] as num?)?.toInt() ?? 3,
                  accent: accent,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(tr(context, 'todayGoal'),
                      style: const TextStyle(color: Palette.grey, fontWeight: FontWeight.w700)),
                ),
              ]),
            ]),
          ),
          const SizedBox(height: 14),
          // Review tile — daily spaced repetition, $0.
          EduCard(
            onTap: _playReview,
            color: const Color(0xFF1D3A28),
            child: Row(children: [
              const Text('🎯', style: TextStyle(fontSize: 32)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(tr(context, 'review'),
                      style: const TextStyle(
                          color: Palette.soft, fontWeight: FontWeight.w800, fontSize: 16)),
                  Text(tr(context, 'reviewSub'),
                      style: const TextStyle(color: Palette.grey, fontSize: 12)),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: Palette.grey),
            ]),
          ),
          if (kDebugMode) ...[
            const SizedBox(height: 14),
            EduCard(
              onTap: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const DemosScreen())),
              child: Row(children: [
                const Text('🧪', style: TextStyle(fontSize: 30)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tr(context, 'demoGames'),
                        style: const TextStyle(
                            color: Palette.soft, fontWeight: FontWeight.w800, fontSize: 16)),
                    Text(tr(context, 'demoSub'),
                        style: const TextStyle(color: Palette.grey, fontSize: 12)),
                  ]),
                ),
                const Icon(Icons.chevron_right_rounded, color: Palette.grey),
              ]),
            ),
          ],
          const SizedBox(height: 22),
          CandyButton(
            label: tr(context, 'createGame'),
            color: accent,
            height: 62,
            fontSize: 19,
            icon: Icons.add_rounded,
            onTap: () async {
              final feedback = await Navigator.push<Map<String, dynamic>>(
                  context, MaterialPageRoute(builder: (_) => const ComposerScreen()));
              _afterPlay(feedback);
            },
          ),
          const SizedBox(height: 22),
          if (_recent.isNotEmpty) ...[
            Text(tr(context, 'library'),
                style: const TextStyle(
                    color: Palette.grey, fontWeight: FontWeight.w800, fontSize: 14)),
            const SizedBox(height: 10),
            for (final g in _recent)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: GameTile(game: g, afterPlay: _afterPlay),
              ),
          ],
        ],
      ),
    );
  }
}
