import 'package:flutter/material.dart';
import '../../core/palette.dart';
import '../../core/spec_assembler.dart';
import '../../widgets/stat_widgets.dart';
import '../player/player_screen.dart';

/// Demo Games — the zero-key debugging surface inside the app: bundled
/// shells + bundled golden specs, fully offline, no account, no network.
/// These are byte-identical to what generated games play through.
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
    SpecAssembler.demoSpecs().then((s) => mounted ? setState(() => _specs = s) : null);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Palette.dark,
      appBar: AppBar(
        backgroundColor: Palette.dark,
        title: Text(tr(context, 'demoGames'), style: const TextStyle(color: Palette.soft)),
        iconTheme: const IconThemeData(color: Palette.grey),
      ),
      body: _specs == null
          ? const Center(child: CircularProgressIndicator(color: Palette.green))
          : ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: _specs!.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final spec = _specs![i];
                final meta = spec['meta'] as Map<String, dynamic>;
                final ar = meta['language'] == 'ar';
                return EduCard(
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => PlayerScreen(launch: PlayerLaunch.demo(spec))),
                  ),
                  child: Row(children: [
                    Text(kGameTypeEmoji[meta['gameType']] ?? '🎲',
                        style: const TextStyle(fontSize: 34)),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(meta['topic'] as String,
                            textDirection: ar ? TextDirection.rtl : TextDirection.ltr,
                            style: const TextStyle(
                                color: Palette.soft, fontWeight: FontWeight.w800, fontSize: 16)),
                        const SizedBox(height: 4),
                        Text(
                          '${meta['gameType']} • ${meta['theme']} • ${(meta['language'] as String).toUpperCase()}',
                          style: const TextStyle(color: Palette.grey, fontSize: 12),
                        ),
                      ]),
                    ),
                    Text(kThemeEmoji[meta['theme']] ?? '', style: const TextStyle(fontSize: 24)),
                  ]),
                );
              },
            ),
    );
  }
}
