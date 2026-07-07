import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/app_theme.dart';
import '../../core/session.dart';
import '../../core/stage.dart';
import '../../widgets/mascot.dart';
import 'blocks/tutor_block_registry.dart';
import 'tutor_models.dart';

/// One rendered chat turn. Tutor turns keep the structured reply so the UI
/// can render type chips, follow-up questions, suggested actions and — when
/// present — the interactive block.
class _Turn {
  _Turn.student(this.text)
      : isStudent = true,
        reply = null;
  _Turn.tutor(this.reply) : isStudent = false, text = reply!.message;
  _Turn.error(this.text)
      : isStudent = false,
        reply = null,
        isError = true;

  final bool isStudent;
  final String text;
  final TutorReply? reply;
  bool isError = false;

  /// True once this turn's interactive block reported its result (blocks
  /// freeze after one attempt — the tutor takes it from there).
  bool resultSent = false;
}

/// The Ask-OpenMind conversation — a real client of POST /api/v1/tutor/
/// messages. Reused by the Ask tab (full page) and by the in-experience
/// help sheet (with a filled [context]).
class TutorChat extends StatefulWidget {
  const TutorChat({
    super.key,
    this.context_,
    this.seedQuestions = const [],
    this.quickActions = const [],
    this.persistThread = false,
  });

  /// Learning context attached to every question (null on the Ask page).
  final TutorContext? context_;

  /// Tappable example questions shown before the first message.
  final List<String> seedQuestions;

  /// One-tap learning moves ("explain it more simply", "give me a hint…")
  /// shown above the input once a conversation exists. Each tap sends the
  /// text as a real question — same backend call, same conversation.
  final List<String> quickActions;

  /// Ask tab only: remember the active conversation id in Session and restore
  /// the real backend thread (GET /tutor/conversations/:id) on next launch.
  /// In-lesson help sheets stay per-lesson-fresh (false).
  final bool persistThread;

  @override
  State<TutorChat> createState() => TutorChatState();
}

class TutorChatState extends State<TutorChat> {
  final _turns = <_Turn>[];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  String? _conversationId;
  bool _sending = false;
  bool _restoring = false;

  @override
  void initState() {
    super.initState();
    if (widget.persistThread) _restoreThread();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Restores the saved conversation from the backend — the server history is
  /// the source of truth, never a local chat cache. Any failure (offline,
  /// server change) silently starts fresh; an empty thread clears the marker.
  Future<void> _restoreThread() async {
    final id = Session.instance.tutorConversationId;
    if (id == null || !Session.instance.registered) return;
    setState(() => _restoring = true);
    try {
      final res = await Api.tutorConversation(id);
      final messages = (res['messages'] as List? ?? const []).cast<Map<String, dynamic>>();
      if (!mounted) return;
      if (messages.isEmpty) {
        await Session.instance.setTutorConversationId(null);
        return;
      }
      _conversationId = id;
      final restored = <_Turn>[];
      for (var i = 0; i < messages.length; i++) {
        final m = messages[i];
        if (m['role'] == 'student') {
          restored.add(_Turn.student(m['content'] as String));
        } else {
          final turn = _Turn.tutor(TutorReply.fromMap({
            'message': m['content'],
            'responseType': m['responseType'],
            'followUpQuestion': null,
            'suggestedAction': 'none',
            'relatedConcept': null,
            'needsClarification': false,
            'interactivePayload': m['interactivePayload'],
          }));
          // A block whose result already came back stays frozen on restore.
          turn.resultSent = messages
              .skip(i + 1)
              .any((later) => later['interactiveResult'] != null);
          restored.add(turn);
        }
      }
      setState(() => _turns.addAll(restored));
      _scrollDown();
    } catch (_) {/* offline or gone — start fresh, keep the marker for next time */
    } finally {
      if (mounted) setState(() => _restoring = false);
    }
  }

  /// Starts a new conversation (the old thread stays on the server).
  Future<void> clearConversation() async {
    setState(() {
      _turns.clear();
      _conversationId = null;
    });
    if (widget.persistThread) {
      await Session.instance.setTutorConversationId(null);
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> send([String? text, InteractiveResult? interactiveResult]) async {
    final l = AppLocalizations.of(context)!;
    final q = (text ?? _input.text).trim();
    if (q.isEmpty || _sending) return;
    _input.clear();
    setState(() {
      _turns.add(_Turn.student(q));
      _sending = true;
    });
    _scrollDown();

    if (!Session.instance.registered) {
      setState(() {
        _turns.add(_Turn.error(l.translate('tutor_offline')));
        _sending = false;
      });
      _scrollDown();
      return;
    }

    try {
      final res = await Api.askTutor({
        'question': q,
        if (_conversationId != null) 'conversationId': _conversationId,
        if (widget.context_ != null) 'context': widget.context_!.toMap(),
        if (interactiveResult != null) 'interactiveResult': interactiveResult.toMap(),
      });
      final result = TutorAskResult.fromMap(res);
      _conversationId = result.conversationId;
      if (widget.persistThread) {
        await Session.instance.setTutorConversationId(result.conversationId);
      }
      setState(() => _turns.add(_Turn.tutor(result.reply)));
    } on ApiException catch (e) {
      setState(() => _turns.add(_Turn.error(
          e.code == 'RATE_LIMITED' ? l.translate('tutor_rate_limited') : l.translate('tutor_error'))));
    } catch (_) {
      setState(() => _turns.add(_Turn.error(l.translate('tutor_error'))));
    } finally {
      setState(() => _sending = false);
      _scrollDown();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    return Column(
      children: [
        Expanded(
          child: _restoring
              ? const Center(child: CircularProgressIndicator())
              : _turns.isEmpty
                  ? _emptyState(l, cs)
                  : _conversation(cs),
        ),
        if (_turns.isNotEmpty && widget.quickActions.isNotEmpty)
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (final action in widget.quickActions)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: ActionChip(
                      visualDensity: VisualDensity.compact,
                      label: Text(action, style: const TextStyle(fontSize: 12.5)),
                      onPressed: _sending ? null : () => send(action),
                    ),
                  ),
              ],
            ),
          ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    enabled: !_sending,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => send(),
                    maxLength: 600,
                    decoration: InputDecoration(
                      counterText: '',
                      hintText: l.translate('tutor_input_hint'),
                      filled: true,
                      fillColor: AppColors.softBlue,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(AppRadii.input),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(AppRadii.input),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sending ? null : () => send(),
                  icon: const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _emptyState(AppLocalizations l, ColorScheme cs) {
    // Hudhud fronts every "Ask" moment — calmer and smaller for middle
    // schoolers, warm and expressive for primary — never a generic icon.
    final middle =
        Session.instance.stage == LearningStage.middleInteractiveLearning;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 8),
          if (middle)
            Mascot(size: 64, accent: cs.primary, expression: MascotExpression.idle)
          else
            const Mascot(size: 96, expression: MascotExpression.happy),
          const SizedBox(height: 10),
          Text(
            l.translate('tutor_welcome'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14.5, height: 1.7, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              for (final q in widget.seedQuestions)
                ActionChip(
                  label: Text(q, style: const TextStyle(fontSize: 12.5)),
                  onPressed: () => send(q),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _conversation(ColorScheme cs) {
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
      itemCount: _turns.length + (_sending ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == _turns.length) return _thinkingBubble(cs);
        return _bubble(_turns[i], cs);
      },
    );
  }

  Widget _thinkingBubble(ColorScheme cs) {
    final l = AppLocalizations.of(context)!;
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: cs.surface,
          border: Border.all(color: cs.outlineVariant),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 14, height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 8),
            Text(l.translate('tutor_thinking'), style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }

  Widget _bubble(_Turn turn, ColorScheme cs) {
    final l = AppLocalizations.of(context)!;
    final isStudent = turn.isStudent;
    final reply = turn.reply;
    // Grades 7-9 (Ask Hudhud) use the soft learning-yellow retry treatment;
    // the elementary "Ask OpenMind" tab keeps its existing amber look
    // unchanged — this component is shared by both stages, so only the
    // middle-school reading of "error" moves to the new palette.
    final middle = Session.instance.stage == LearningStage.middleInteractiveLearning;
    final errorColor = middle ? AppColors.retryYellowInk : AppColors.mutedAmber;
    final errorSoft = middle ? AppColors.retryYellowSoft : AppColors.mutedAmberSoft;
    return Align(
      alignment: isStudent ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        constraints: const BoxConstraints(maxWidth: 420),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isStudent
              ? cs.primary
              : turn.isError
                  ? errorSoft
                  : cs.surface,
          border: isStudent ? null : Border.all(color: turn.isError ? errorColor : cs.outlineVariant),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (reply != null) ...[
              _typeChip(reply.responseType, cs),
              const SizedBox(height: 6),
            ],
            if (turn.isError) ...[
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.refresh_rounded, size: 15, color: errorColor),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      turn.text,
                      style: TextStyle(
                        fontSize: 14.5,
                        height: 1.7,
                        fontWeight: FontWeight.w600,
                        color: errorColor,
                      ),
                    ),
                  ),
                ],
              ),
            ] else
              Text(
                turn.text,
                style: TextStyle(
                  fontSize: 14.5,
                  height: 1.7,
                  color: isStudent ? cs.onPrimary : cs.onSurface,
                ),
              ),
            // Ask → See → Try: an approved block renders from the controlled
            // registry only; the learner's action returns through send() as a
            // real conversation turn with the structured result attached.
            if (reply?.interactivePayload != null)
              buildTutorBlock(
                    payload: reply!.interactivePayload!,
                    enabled: !turn.resultSent && !_sending,
                    answered: turn.resultSent,
                    onResult: (result, summary) {
                      if (turn.resultSent || _sending) return;
                      turn.resultSent = true;
                      send(summary, result);
                    },
                  ) ??
                  const SizedBox.shrink(),
            if (reply?.followUpQuestion != null) ...[
              const SizedBox(height: 8),
              ActionChip(
                avatar: const Icon(Icons.lightbulb_outline_rounded, size: 16),
                label: Text(reply!.followUpQuestion!, style: const TextStyle(fontSize: 12.5)),
                onPressed: _sending ? null : () => send(reply.followUpQuestion),
              ),
            ],
            if (reply != null && reply.suggestedAction == TutorSuggestedAction.tryAgain) ...[
              const SizedBox(height: 6),
              Text(
                l.translate('tutor_try_again'),
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.mutedGreen),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _typeChip(TutorResponseType type, ColorScheme cs) {
    final l = AppLocalizations.of(context)!;
    final (key, icon) = switch (type) {
      TutorResponseType.explanation => ('tutor_type_explanation', Icons.menu_book_rounded),
      TutorResponseType.hint => ('tutor_type_hint', Icons.lightbulb_rounded),
      TutorResponseType.question => ('tutor_type_question', Icons.help_outline_rounded),
      TutorResponseType.encouragement => ('tutor_type_encouragement', Icons.celebration_rounded),
      TutorResponseType.correction => ('tutor_type_correction', Icons.build_circle_outlined),
      TutorResponseType.nextStep => ('tutor_type_next_step', Icons.arrow_circle_left_outlined),
      TutorResponseType.unknown => ('tutor_type_explanation', Icons.menu_book_rounded),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: cs.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: cs.primary),
          const SizedBox(width: 4),
          Text(
            l.translate(key),
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: cs.primary),
          ),
        ],
      ),
    );
  }
}
