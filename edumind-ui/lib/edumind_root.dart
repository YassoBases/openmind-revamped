import 'about_screen.dart';
import 'package:flutter/material.dart';

import 'app_localizations.dart';
import 'home_screen.dart';
import 'profile_screen.dart';
import 'settings_screen.dart';

class EduMindRoot extends StatefulWidget {
  const EduMindRoot({super.key});

  @override
  State<EduMindRoot> createState() => _EduMindRootState();
}

class _EduMindRootState extends State<EduMindRoot> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final cs = t.colorScheme;
    return Scaffold(
      body: Stack(
        children: [
          // Subtle “purple rail” ambiance (works in RTL/LTR).
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    cs.primary.withValues(alpha: 0.08),
                    cs.primary.withValues(alpha: 0.0),
                  ],
                  begin: AlignmentDirectional.centerStart,
                  end: AlignmentDirectional.centerEnd,
                ),
              ),
            ),
          ),
          IndexedStack(
            index: _index,
            children: const [HomeScreen(), ProfileScreen(), SettingsScreen(), AboutScreen()],
          ),
        ],
      ),
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
            onDestinationSelected: (i) => setState(() => _index = i),
            destinations: [
              NavigationDestination(
                icon: const Icon(Icons.home_outlined),
                selectedIcon: const Icon(Icons.home_rounded),
                label: AppLocalizations.of(context)!.translate('nav_home'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.person_outline_rounded),
                selectedIcon: const Icon(Icons.person_rounded),
                label: AppLocalizations.of(context)!.translate('nav_profile'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.settings_outlined),
                selectedIcon: const Icon(Icons.settings_rounded),
                label: AppLocalizations.of(context)!.translate('nav_settings'),
              ),
              NavigationDestination(
                icon: const Icon(Icons.info_outline_rounded),
                selectedIcon: const Icon(Icons.info_rounded),
                label: AppLocalizations.of(context)!.translate('nav_about'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
