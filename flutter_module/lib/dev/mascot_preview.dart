import 'package:flutter/material.dart';
import '../widgets/mascot.dart';

/// Character preview — the Flutter twin of `shells/tools/charshot.mjs`.
/// Renders Hudhud + Nahla in every expression so the brand art can be
/// iterated visually:
///   flutter build web -t lib/dev/mascot_preview.dart
///   node tool/serve.mjs  →  screenshot http://localhost:5000
void main() => runApp(const _PreviewApp());

class _PreviewApp extends StatelessWidget {
  const _PreviewApp();

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFF1CB0F6);
    const exprs = MascotExpression.values;
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFFF6EFE2),
        body: Center(
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (final e in exprs)
                _cell('hudhud:${e.name}',
                    Mascot(size: 170, accent: accent, expression: e)),
            ]),
            const SizedBox(height: 24),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (final e in exprs)
                _cell(
                    'nahla:${e.name}',
                    Mascot(
                        size: 170,
                        accent: accent,
                        character: MascotCharacter.bee,
                        expression: e)),
            ]),
            const SizedBox(height: 24),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Mascot(
                  size: 90, accent: accent, expression: MascotExpression.idle),
              const SizedBox(width: 8),
              const SpeechBubble(text: 'What shall we explore today?'),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget _cell(String label, Widget child) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Column(children: [
          child,
          Text(label,
              style: const TextStyle(
                  color: Color(0xFF7A2D22), fontSize: 13, fontWeight: FontWeight.w600)),
        ]),
      );
}
