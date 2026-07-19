import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/middle_palette.dart';
import '../../widgets/mascot.dart';
import 'tutor_chat.dart';
import 'tutor_models.dart';

/// The one contextual "Ask Hudhud" entry point. Every stuck-learner
/// affordance — inside a lesson step, on a path's station list, wherever
/// comes next — opens this same sheet with the same [TutorChat], just
/// seeded with wherever the learner actually is. Never a second chat system.
/// The header names that "wherever" (path/step) so the learner can see the
/// sheet already knows what they're stuck on, not a blank generic chat.
Future<void> openAskHudhud(
  BuildContext context, {
  required TutorContext context_,
  List<String> seedQuestions = const [],
  List<String> quickActions = const [],
}) {
  final l = AppLocalizations.of(context)!;
  final subtitle = [
    if (context_.pathTitle != null) context_.pathTitle!,
    if ((context_.stepTitle ?? context_.experienceTitle) != null)
      (context_.stepTitle ?? context_.experienceTitle)!,
  ].join(' · ');
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: MiddlePalette.card,
    builder: (sheetCtx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(sheetCtx).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(sheetCtx).size.height * 0.75,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const Mascot(
                    size: 40,
                    accent: MiddlePalette.primaryAction,
                    expression: MascotExpression.idle,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l.translate('tutor_help_title'),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: MiddlePalette.blueInk,
                          ),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: MiddlePalette.body,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: MiddlePalette.outline),
            Expanded(
              child: TutorChat(
                context_: context_,
                seedQuestions: seedQuestions,
                quickActions: quickActions,
                isHelpSheet: true,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// The small, optional "stuck?" label + icon shared by every entry point —
/// a compact text button, never a chat surface of its own.
class AskHudhudEntry extends StatelessWidget {
  const AskHudhudEntry({super.key, required this.onPressed, required this.color});

  final VoidCallback onPressed;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return TextButton.icon(
      onPressed: onPressed,
      icon: Icon(Icons.support_agent_rounded, size: 17, color: color),
      label: Text(
        l.translate('ask_hudhud_stuck'),
        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: color),
      ),
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        visualDensity: VisualDensity.compact,
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
    );
  }
}
