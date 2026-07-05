import 'package:flutter/material.dart';

import 'app_theme.dart';
import 'session.dart';
import 'stage.dart';

/// Keeps the middle-school product a phone-shaped app everywhere: on wide
/// (desktop web) viewports the whole navigator — tabs AND pushed routes like
/// the lesson player — renders inside a narrow centered column instead of
/// stretching into a web dashboard. Phones and the primary-games experience
/// are untouched. Wired as MaterialApp.builder in main.dart.
class MobileShell extends StatelessWidget {
  const MobileShell({super.key, required this.child});

  final Widget child;

  /// Design-first width for the Grade 7 experience (390–430px screens).
  static const double maxWidth = 430;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: Session.revision,
      builder: (context, _, __) {
        final middle =
            Session.instance.stage == LearningStage.middleInteractiveLearning;
        if (!middle) return child;
        return LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth <= maxWidth + 40) return child;
            // Warm device framing that matches onboarding's OnbRail: a cream
            // surround with the phone as an ivory rounded card + hairline.
            return ColoredBox(
              color: AppColors.cream,
              child: Center(
                child: Container(
                  constraints: const BoxConstraints(maxWidth: maxWidth),
                  margin: const EdgeInsets.symmetric(vertical: 16),
                  decoration: BoxDecoration(
                    color: AppColors.ivory,
                    borderRadius: BorderRadius.circular(AppRadii.rail),
                    border: Border.all(
                      color: AppColors.outline.withValues(alpha: 0.8),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.blueInk.withValues(alpha: 0.12),
                        blurRadius: 36,
                        offset: const Offset(0, 14),
                      ),
                    ],
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: child,
                ),
              ),
            );
          },
        );
      },
    );
  }
}
