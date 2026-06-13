import 'package:flutter/material.dart';

import 'app_localizations.dart';
import 'core/session.dart';
import 'data/game_store.dart';
import 'widgets/mascot.dart';

/// The student profile — real data only: nickname, grade, language, and live
/// counts from the local game store. Fully bilingual; direction follows locale.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  int _gamesMade = 0;
  int _points = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final games = await GameStore.instance.list();
    if (!mounted) return;
    setState(() {
      _gamesMade = games.length;
      _points = games.fold<int>(0, (sum, g) => sum + g.bestScore);
    });
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final profile = Session.instance.profile ?? const {};
    final name = (profile['name'] as String?) ?? 'Player';
    final grade = (profile['grade'] as num?)?.toInt();
    final lang = (profile['language'] as String?) == 'ar' ? 'العربية' : 'English';

    return Scaffold(
      appBar: AppBar(title: Text(l.translate('profile_title'))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(children: [
                const Mascot(size: 72, character: MascotCharacter.bee, expression: MascotExpression.happy),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    Wrap(spacing: 8, runSpacing: 6, children: [
                      if (grade != null) _chip(cs, '${l.translate('profile_grade')} $grade'),
                      _chip(cs, '${l.translate('profile_language')}: $lang'),
                    ]),
                  ]),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: _StatCard(
              title: l.translate('profile_games_made'),
              value: '$_gamesMade',
              color: cs.primary,
              icon: Icons.videogame_asset_rounded,
            )),
            const SizedBox(width: 14),
            Expanded(child: _StatCard(
              title: l.translate('profile_total_points'),
              value: '$_points',
              color: cs.secondary,
              icon: Icons.star_rounded,
            )),
          ]),
        ],
      ),
    );
  }

  Widget _chip(ColorScheme cs, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: cs.secondary.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: cs.secondary.withValues(alpha: 0.5)),
        ),
        child: Text(text, style: TextStyle(color: cs.secondary, fontWeight: FontWeight.w800, fontSize: 13)),
      );
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.title, required this.value, required this.color, required this.icon});
  final String title;
  final String value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 10),
          Text(value, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: color)),
          const SizedBox(height: 2),
          Text(title, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontWeight: FontWeight.w700, fontSize: 13)),
        ]),
      ),
    );
  }
}
