import 'package:flutter/material.dart';

import 'about_screen.dart';
import 'app_localizations.dart';
import 'core/api_client.dart';
import 'core/interests_sync.dart';
import 'core/registration_sync.dart';
import 'core/session.dart';
import 'core/stage.dart';
import 'core/sync_lifecycle.dart';
import 'features/learn/journey_screen.dart';
import 'features/learn/learn_progress_store.dart';
import 'features/me/me_screen.dart';
import 'features/start/start_screen.dart';
import 'features/tutor/ask_screen.dart';
import 'home_screen.dart';
import 'profile_screen.dart';
import 'settings_screen.dart';

/// One shared shell, two stage-appropriate experiences (core/stage.dart):
///
///  - primary_games (grades 1-6): the elementary games product — the game
///    trail Home, the tutor, profile, settings, about. No middle-school
///    journey surfaces (a primary learner never sees an empty Grade-7 map).
///  - middle_interactive_learning (grades 7-9): the four-tab redesign —
///    البداية / رحلتي / مساعدي / أنا. No elementary game surfaces.
///
/// The stage comes from Session (backend-resolved when registered, grade
/// fallback offline); on startup the trusted view is re-fetched so a learner
/// promoted to Grade 7 lands in the middle experience automatically while
/// their game history stays safely on their account.
class EduMindRoot extends StatefulWidget {
  const EduMindRoot({super.key});

  @override
  State<EduMindRoot> createState() => _EduMindRootState();
}

class _EduMindRootState extends State<EduMindRoot> {
  int _index = 0;
  LearningStage _stage = Session.instance.stage;

  /// The backend is the trusted source of grade/stage/context. Also the one
  /// place that retries anything left pending from onboarding or an offline
  /// interests edit (RegistrationSync/InterestsSync) — [SyncOnStartupAndResume]
  /// (below, in build()) calls this on every app start and every foreground
  /// resume, not just once.
  Future<void> _refreshIdentity() async {
    if (RegistrationSync.isPending) {
      final registered = await RegistrationSync.retry();
      if (registered && mounted) setState(() {}); // let banners/badges react
    }
    if (!Session.instance.registered) return;
    try {
      final me = await Api.me();
      await Session.instance.applyStudentView(me);
      final resolved = Session.instance.stage;
      if (mounted && resolved != _stage) {
        setState(() {
          _stage = resolved;
          _index = 0;
        });
      }
    } catch (_) {/* offline — the cached stage stands */}
    if (InterestsSync.isPending) await InterestsSync.retry();
    // Middle-school progress reconciles in the background at startup too.
    if (Session.instance.stage == LearningStage.middleInteractiveLearning) {
      final store = await LearnProgressStore.load();
      await store.syncWithBackend();
    }
  }

  void _goTo(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final middle = _stage == LearningStage.middleInteractiveLearning;

    final screens = middle
        ? <Widget>[
            StartScreen(onAskTutor: () => _goTo(2), onOpenJourney: () => _goTo(1)),
            JourneyScreen(onAskTutor: () => _goTo(2)),
            const AskScreen(),
            const MeScreen(),
          ]
        : const <Widget>[
            HomeScreen(),
            AskScreen(),
            ProfileScreen(),
            SettingsScreen(),
            AboutScreen(),
          ];

    final destinations = middle
        ? [
            NavigationDestination(
              icon: const Icon(Icons.flag_outlined),
              selectedIcon: const Icon(Icons.flag_rounded),
              label: l.translate('nav_start'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.route_outlined),
              selectedIcon: const Icon(Icons.route_rounded),
              label: l.translate('nav_journey'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.support_agent_outlined),
              selectedIcon: const Icon(Icons.support_agent_rounded),
              label: l.translate('nav_tutor'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.person_outline_rounded),
              selectedIcon: const Icon(Icons.person_rounded),
              label: l.translate('nav_me'),
            ),
          ]
        : [
            NavigationDestination(
              icon: const Icon(Icons.home_outlined),
              selectedIcon: const Icon(Icons.home_rounded),
              label: l.translate('nav_home'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.chat_bubble_outline_rounded),
              selectedIcon: const Icon(Icons.chat_bubble_rounded),
              label: l.translate('nav_ask'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.person_outline_rounded),
              selectedIcon: const Icon(Icons.person_rounded),
              label: l.translate('nav_profile'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.settings_outlined),
              selectedIcon: const Icon(Icons.settings_rounded),
              label: l.translate('nav_settings'),
            ),
            NavigationDestination(
              icon: const Icon(Icons.info_outline_rounded),
              selectedIcon: const Icon(Icons.info_rounded),
              label: l.translate('nav_about'),
            ),
          ];

    return SyncOnStartupAndResume(
      onSync: _refreshIdentity,
      child: Scaffold(
        body: IndexedStack(index: _index, children: screens),
        bottomNavigationBar: Container(
          margin: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          decoration: BoxDecoration(
            color: cs.surface.withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: cs.shadow.withValues(alpha: 0.12),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
            border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.6)),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: NavigationBar(
              selectedIndex: _index,
              onDestinationSelected: _goTo,
              destinations: destinations,
            ),
          ),
        ),
      ),
    );
  }
}
