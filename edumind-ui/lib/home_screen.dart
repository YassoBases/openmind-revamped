import 'package:edumind/app_localizations.dart';
import 'package:flutter/material.dart';

import 'core/app_theme.dart';
import 'core/palette.dart';
import 'core/xp_store.dart';
import 'features/worlds/lesson_picker_screen.dart';
import 'features/worlds/world_map_screen.dart';
import 'features/worlds/world_models.dart';
import 'features/worlds/world_store.dart';
import 'widgets/mascot.dart';

/// The home of the primary-grades app: **Lesson Worlds**. Each school lesson
/// becomes a themed world of short game stages the child plays one at a time,
/// unlocking the next after each. This IS the learning experience — the old
/// one-off "type a topic → single flat game" flow has been retired in favor of
/// stage-based worlds.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => HomeScreenState();
}

class HomeScreenState extends State<HomeScreen> {
  List<World> _worlds = [];
  int _xp = 0;
  int _level = 1;
  int _streak = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    // Reconcile the XP ledger in the background (quiet no-op offline).
    XpStore.instance().then((s) => s.refresh().then((_) => _load()));
  }

  /// Public so the dashboard/root can refresh after returning to this tab.
  Future<void> reload() => _load();

  Future<void> _load() async {
    final worldStore = await WorldStore.instance();
    final worlds = await worldStore.list();
    final xpStore = await XpStore.instance();
    if (mounted) {
      setState(() {
        _worlds = worlds;
        _xp = xpStore.xp;
        _level = xpStore.level;
        _streak = xpStore.streak;
        _loading = false;
      });
    }
  }

  Future<void> _newWorld() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => const LessonPickerScreen()),
    );
    if (mounted) await _load();
  }

  Future<void> _openWorld(World world) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => WorldMapScreen(worldId: world.id)),
    );
    if (mounted) await _load();
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
                        : (_worlds.isEmpty ? _emptyState() : _worldsList()),
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

  /// First run (or all worlds cleared): a warm invitation to begin.
  Widget _emptyState() {
    final l = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Mascot(expression: MascotExpression.happy, size: 130),
            const SizedBox(height: 18),
            Text(
              l.translate('worlds_empty_title'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.blueInk,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              l.translate('worlds_empty_body'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, color: AppColors.body, height: 1.5),
            ),
            const SizedBox(height: 24),
            _newWorldButton(large: true),
          ],
        ),
      ),
    );
  }

  Widget _worldsList() {
    final l = AppLocalizations.of(context)!;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              l.translate('worlds_title'),
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.blueInk,
              ),
            ),
          ),
          for (final world in _worlds) _worldCard(world),
          const SizedBox(height: 6),
          _newWorldButton(),
        ],
      ),
    );
  }

  Widget _worldCard(World world) {
    final l = AppLocalizations.of(context)!;
    final states = worldNodeStates(world.stages);
    final currentIndex = states.indexOf(StageNodeState.current);
    final nextFocus = currentIndex >= 0 ? world.stages[currentIndex].focus : null;
    return Card(
      color: Colors.white.withValues(alpha: 0.94),
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Palette.radiusCard),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(Palette.radiusCard),
        onTap: () => _openWorld(world),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              SizedBox(
                width: 52,
                height: 52,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    CircularProgressIndicator(
                      value: world.stageCount == 0
                          ? 0
                          : world.completedCount / world.stageCount,
                      strokeWidth: 6,
                      backgroundColor: AppColors.softBlue,
                      color: world.finished ? Palette.yellow : Palette.blue,
                    ),
                    Text(
                      world.finished ? '★' : '${world.completedCount}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.blueInk,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      world.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      world.finished
                          ? l.translate('world_complete')
                          : (nextFocus ??
                              l.translateWith('world_progress', {
                                'done': '${world.completedCount}',
                                'total': '${world.stageCount}',
                              })),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.body),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.body),
            ],
          ),
        ),
      ),
    );
  }

  Widget _newWorldButton({bool large = false}) {
    final l = AppLocalizations.of(context)!;
    return Material(
      color: Palette.blue,
      borderRadius: BorderRadius.circular(Palette.radiusCard),
      child: InkWell(
        borderRadius: BorderRadius.circular(Palette.radiusCard),
        onTap: _newWorld,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 20, vertical: large ? 16 : 14),
          child: Row(
            mainAxisSize: large ? MainAxisSize.min : MainAxisSize.max,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.add_circle_rounded, color: Colors.white, size: 30),
              const SizedBox(width: 10),
              Text(
                l.translate('world_new'),
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: large ? 17 : 16,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _headerStats() {
    final cs = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
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
                  '${l.translate('level_label')} $_level',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: cs.secondary,
                  ),
                ),
                if (_streak > 1) ...[
                  const SizedBox(width: 10),
                  Text(
                    '🔥$_streak',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Palette.yellow,
                    ),
                  ),
                ],
              ],
            ),
          ),
          pill(
            Row(
              children: [
                Text(
                  '$_xp ${l.translate('points_label')}',
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
}
