import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../widgets/mascot.dart';
import '../../widgets/stat_widgets.dart';

/// Profile: league badge, lifetime stats, recent XP events.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _stats;
  List<dynamic> _events = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!Session.instance.registered) return;
    try {
      final stats = await Api.get('/api/v1/students/me/stats') as Map<String, dynamic>;
      final events = await Api.get('/api/v1/students/me/xp-events?limit=20') as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _stats = stats;
          _events = events['items'] as List<dynamic>;
        });
      }
    } catch (_) {/* offline */}
  }

  @override
  Widget build(BuildContext context) {
    final accent = hexToColor(Session.instance.color);
    final stats = _stats;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Center(
          child: Column(children: [
            // profile is XP/league territory — Nahla's stage
            Mascot(size: 110, accent: accent, expression: MascotExpression.happy, character: MascotCharacter.bee),
            const SizedBox(height: 10),
            Text(Session.instance.name,
                style: const TextStyle(
                    color: Palette.soft, fontSize: 24, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            LeagueBadge(league: (stats?['league'] as String?) ?? 'bronze'),
          ]),
        ),
        const SizedBox(height: 22),
        EduCard(
          child: Column(children: [
            XpBar(xp: (stats?['xp'] as num?)?.toInt() ?? 0),
            const SizedBox(height: 14),
            Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
              _stat('🔥', '${(stats?['streakCount'] as num?)?.toInt() ?? 0}', tr(context, 'streak')),
              _stat('🎮', '${(stats?['gamesCount'] as num?)?.toInt() ?? 0}', tr(context, 'library')),
              _stat('⚡', '${(stats?['todayXp'] as num?)?.toInt() ?? 0}', tr(context, 'todayGoal')),
            ]),
          ]),
        ),
        const SizedBox(height: 18),
        if (_events.isNotEmpty) ...[
          Text(tr(context, 'recentXp'),
              style: const TextStyle(color: Palette.grey, fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 10),
          for (final e in _events)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                Text('+${e['amount']}',
                    style: const TextStyle(color: Palette.yellow, fontWeight: FontWeight.w800)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(e['reason'] as String,
                      style: const TextStyle(color: Palette.grey, fontSize: 13),
                      overflow: TextOverflow.ellipsis),
                ),
              ]),
            ),
        ],
      ],
    );
  }

  Widget _stat(String emoji, String value, String label) {
    return Column(children: [
      Text(emoji, style: const TextStyle(fontSize: 22)),
      Text(value, style: const TextStyle(color: Palette.soft, fontWeight: FontWeight.w800, fontSize: 18)),
      Text(label, style: const TextStyle(color: Palette.grey, fontSize: 11)),
    ]);
  }
}
