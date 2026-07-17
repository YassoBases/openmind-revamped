import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/session.dart';
import '../../core/stage.dart';
import '../../widgets/mascot.dart';
import 'tutor_chat.dart';
import 'tutor_models.dart';

/// The "Ask Hudhud" tab: a question about any school subject goes to the
/// backend tutor endpoint and comes back as a structured, pedagogy-first
/// reply — sometimes carrying an interactive Ask → See → Try block. Hudhud
/// fronts the conversation; the active thread is the real backend
/// conversation, restored across launches.
class AskScreen extends StatefulWidget {
  const AskScreen({super.key});

  @override
  State<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends State<AskScreen> {
  final _chatKey = GlobalKey<TutorChatState>();

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
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Mascot(size: 44, accent: cs.primary, expression: MascotExpression.idle),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l.translate('tutor_title'),
                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: l.translate('tutor_new_chat'),
                    icon: Icon(Icons.add_comment_outlined, color: cs.primary),
                    onPressed: () => _chatKey.currentState?.clearConversation(),
                  ),
                ],
              ),
            ),
            Expanded(
              child: TutorChat(
                key: _chatKey,
                context_: TutorContext(source: 'ask'),
                persistThread: true,
                // The five study programs, offered before the conversation
                // starts — the main Ask Hudhud surface only; the in-lesson
                // help sheet keeps its contextual quick actions instead.
                showStudyModes: middle,
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
                        'كيف أضع الكسر ٣/٤ على خط الأعداد؟',
                        'رتب لي مراحل دورة الماء',
                        'كيف أميز الاسم من الفعل من الحرف؟',
                        'لماذا نرى البرق قبل أن نسمع الرعد؟',
                      ]
                    : const [
                        'How do I place 3/4 on a number line?',
                        'Order the stages of the water cycle',
                        'How do I tell a noun from a verb?',
                        'Why do we see lightning before thunder?',
                      ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
