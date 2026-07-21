import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/palette.dart';
import '../../core/spec_assembler.dart';
import '../../widgets/mascot.dart';
import '../player/player_screen.dart';

class DemosScreen extends StatefulWidget {
  const DemosScreen({super.key});

  @override
  State<DemosScreen> createState() => _DemosScreenState();
}

class _DemosScreenState extends State<DemosScreen> {
  List<Map<String, dynamic>>? _specs;

  @override
  void initState() {
    super.initState();
    SpecAssembler.demoSpecs().then((specs) {
      if (mounted) setState(() => _specs = specs);
    });
  }

  /// Play a demo, then surface the completion celebration the player returns
  /// (canned locally for demos) so finishing a demo never feels dead.
  Future<void> _playDemo(Map<String, dynamic> spec) async {
    final feedback = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute<Map<String, dynamic>>(
        builder: (_) => PlayerScreen(launch: PlayerLaunch.demo(spec)),
      ),
    );
    if (!mounted || feedback == null || feedback['headline'] == null) return;
    await showDialog<void>(
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
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(l.translate('demo_games'))),
      body: _specs == null
          ? const Center(child: CircularProgressIndicator())
          : ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: _specs!.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final spec = _specs![index];
                final meta = spec['meta'] as Map<String, dynamic>;
                final language = (meta['language'] as String?) ?? 'en';
                final topic =
                    (meta['topic'] as String?) ?? l.translate('demo_games');
                final gameType = (meta['gameType'] as String?) ?? 'quest_path';
                final theme = (meta['theme'] as String?) ?? '';
                // Mechanic variants are the star of the row when present —
                // "goal_shootout • draw_pass" says more than the theme does.
                final variant = meta['variant'] as String?;
                final flavor = (variant != null && variant != 'classic')
                    ? variant
                    : theme;

                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    leading: CircleAvatar(
                      radius: 26,
                      backgroundColor: cs.secondaryContainer,
                      child: Text(
                        kGameTypeEmoji[gameType] ?? '🎮',
                        style: const TextStyle(fontSize: 24),
                      ),
                    ),
                    title: Text(
                      topic,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      textDirection: language == 'ar'
                          ? TextDirection.rtl
                          : TextDirection.ltr,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        '$gameType • $flavor • ${language.toUpperCase()}',
                        style: TextStyle(color: cs.onSurfaceVariant),
                      ),
                    ),
                    trailing: Icon(
                      Icons.play_circle_fill_rounded,
                      color: cs.primary,
                    ),
                    onTap: () => _playDemo(spec),
                  ),
                );
              },
            ),
    );
  }
}
