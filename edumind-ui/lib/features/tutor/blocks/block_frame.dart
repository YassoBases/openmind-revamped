import 'package:flutter/material.dart';

import '../../../app_localizations.dart';
import '../../../core/app_theme.dart';
import '../tutor_models.dart';

/// Shared chrome for every tutor interactive block: title, one-line
/// instructions, the manipulative, and — once the learner acted — the outcome
/// banner and "sent to your tutor" note. Keeps the three blocks visually one
/// family inside the chat.
class BlockFrame extends StatelessWidget {
  const BlockFrame({
    super.key,
    required this.title,
    required this.instructions,
    required this.child,
    this.outcome,
    this.sent = false,
  });

  final String title;
  final String instructions;
  final Widget child;

  /// Set after the learner checked — drives the banner.
  final InteractiveOutcome? outcome;

  /// True once the result went back to the tutor.
  final bool sent;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;

    // Correct is the one true success green; partial and incorrect share the
    // same soft learning-yellow retry treatment (never red/purple/amber/
    // orange — orange stays reserved for progress/discovery elsewhere on this
    // screen).
    final (bannerKey, bannerColor) = switch (outcome) {
      InteractiveOutcome.correct => ('blk_correct', AppColors.mutedGreen),
      InteractiveOutcome.partiallyCorrect => ('blk_partial', AppColors.retryYellowInk),
      InteractiveOutcome.incorrect => ('blk_incorrect', AppColors.retryYellowInk),
      InteractiveOutcome.explored || null => (null, cs.onSurfaceVariant),
    };

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.softBlue,
        border: Border.all(color: AppColors.blue.withValues(alpha: 0.20)),
        borderRadius: BorderRadius.circular(AppRadii.button),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.touch_app_rounded, size: 17, color: AppColors.blue),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            instructions,
            style: TextStyle(fontSize: 12.5, height: 1.5, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 10),
          child,
          if (bannerKey != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(
                  outcome == InteractiveOutcome.correct
                      ? Icons.check_circle_rounded
                      : Icons.info_rounded,
                  size: 16,
                  color: bannerColor,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    l.translate(bannerKey),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: bannerColor,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (sent) ...[
            const SizedBox(height: 6),
            Text(
              l.translate('blk_sent'),
              style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}
