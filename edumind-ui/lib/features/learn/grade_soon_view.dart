import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/middle_palette.dart';
import '../../core/palette.dart';
import '../../widgets/mascot.dart';

/// The honest grades-8/9 state: their curriculum is not ready, and we never
/// dress grade-7 content up as theirs. Names the learner's real grade, shows
/// no fake map, and offers the one thing that genuinely works today — the
/// cross-subject tutor. One of Hudhud's few, deliberate guide moments.
class GradeSoonView extends StatelessWidget {
  const GradeSoonView({super.key, required this.grade, this.onAskTutor});

  final int grade;

  /// Jumps to the مساعدي tab (wired by the shell).
  final VoidCallback? onAskTutor;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final gradeWord = l.translate('grade_word_$grade');

    return Center(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(horizontal: 28),
        children: [
          const Center(
            child: Mascot(
              size: 96,
              accent: MiddlePalette.blueInk,
              expression: MascotExpression.idle,
            ),
          ),
          const SizedBox(height: 18),
          Text(
            l.translateWith('grade_soon_title', {'g': gradeWord}),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              height: 1.5,
              color: MiddlePalette.blueInk,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l.translate('grade_soon_body'),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 14.5,
              height: 1.7,
              color: MiddlePalette.body,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            l.translate('grade_soon_can'),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: MiddlePalette.body,
            ),
          ),
          const SizedBox(height: 10),
          Material(
            color: MiddlePalette.softBlue,
            borderRadius: BorderRadius.circular(Palette.radiusCard),
            child: InkWell(
              borderRadius: BorderRadius.circular(Palette.radiusCard),
              onTap: onAskTutor,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  border: Border.all(color: MiddlePalette.outline),
                  borderRadius: BorderRadius.circular(Palette.radiusCard),
                ),
                child: Row(
                  children: [
                    const Text('💬', style: TextStyle(fontSize: 24)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        l.translate('grade_soon_ask'),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: MiddlePalette.blueInk,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
