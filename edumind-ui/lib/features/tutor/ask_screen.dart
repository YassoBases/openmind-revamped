import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/session.dart';
import '../../core/stage.dart';
import 'tutor_chat.dart';
import 'tutor_models.dart';

/// The "Ask OpenMind" tab: a question about any school subject goes to the
/// backend tutor endpoint and comes back as a structured, pedagogy-first
/// reply. Content language follows the student's profile.
class AskScreen extends StatelessWidget {
  const AskScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Rebuilt on every profile write (Session.revision), so a lens picked on
    // Home is reflected in the quick actions without recreating the chat.
    return ValueListenableBuilder<int>(
      valueListenable: Session.revision,
      builder: (context, _, __) => _buildScreen(context),
    );
  }

  Widget _buildScreen(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final ar = Session.instance.language == 'ar';
    final middle =
        Session.instance.stage == LearningStage.middleInteractiveLearning;
    final lens = Session.instance.learningContext;
    // «أعطني مثالًا من سياقي» names the learner's real saved lens when one
    // exists, so the question the backend receives is specific and honest.
    final exampleAction = lens == null
        ? l.translate('qa_example_ctx')
        : (ar
            ? 'أعطني مثالًا من عالم ${l.translate('ctx_$lens')}'
            : 'Give me an example from the world of ${l.translate('ctx_$lens')}');

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l.translate('tutor_title'),
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    l.translate('tutor_subtitle'),
                    style: TextStyle(fontSize: 14, height: 1.6, color: cs.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            Expanded(
              child: TutorChat(
                context_: TutorContext(source: 'ask'),
                quickActions: middle
                    ? [
                        l.translate('qa_simpler'),
                        exampleAction,
                        l.translate('qa_ask_me'),
                        l.translate('qa_hint_only'),
                      ]
                    : const [],
                seedQuestions: ar
                    ? const [
                        'كيف أحسب مساحة المثلث؟',
                        'ما الفرق بين الفعل اللازم والمتعدي؟',
                        'لماذا نرى البرق قبل أن نسمع الرعد؟',
                        'كيف أحسب الحسم في السوق؟',
                      ]
                    : const [
                        'How do I find the area of a triangle?',
                        'Why do we see lightning before thunder?',
                        'How do I calculate a market discount?',
                      ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
