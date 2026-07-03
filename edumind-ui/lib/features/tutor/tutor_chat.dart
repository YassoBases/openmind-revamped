import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../core/stage.dart';
import '../../widgets/mascot.dart';
import 'tutor_models.dart';

/// One rendered chat turn. Tutor turns keep the structured reply so the UI
/// can render type chips, follow-up questions and suggested actions.
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
  });

  /// Learning context attached to every question (null on the Ask page).
  final TutorContext? context_;

  /// Tappable example questions shown before the first message.
  final List<String> seedQuestions;

  /// One-tap learning moves ("explain it more simply", "give me a hint…")
  /// shown above the input once a conversation exists. Each tap sends the
  /// text as a real question — same backend call, same conversation.
  final List<String> quickActions;

  @override
  State<TutorChat> createState() => TutorChatState();
}

class TutorChatState extends State<TutorChat> {
  final _turns = <_Turn>[];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  String? _conversationId;
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
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

  Future<void> send([String? text]) async {
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
      });
      final result = TutorAskResult.fromMap(res);
      _conversationId = result.conversationId;
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
          child: _turns.isEmpty ? _emptyState(l, cs) : _conversation(cs),
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
                      fillColor: cs.surface,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(Palette.radiusInput),
                        borderSide: BorderSide(color: cs.outlineVariant),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(Palette.radiusInput),
                        borderSide: BorderSide(color: cs.outlineVariant),
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
    // The mascot belongs to the primary product; middle schoolers get a calm,
    // purposeful companion mark instead.
    final middle =
        Session.instance.stage == LearningStage.middleInteractiveLearning;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 8),
          if (middle)
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: cs.primary.withValues(alpha: 0.10),
              ),
              child: Icon(Icons.psychology_alt_rounded, size: 38, color: cs.primary),
            )
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
                  ? Palette.heart.withValues(alpha: 0.10)
                  : cs.surface,
          border: isStudent ? null : Border.all(color: turn.isError ? Palette.heart : cs.outlineVariant),
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
            Text(
              turn.text,
              style: TextStyle(
                fontSize: 14.5,
                height: 1.7,
                color: isStudent ? cs.onPrimary : cs.onSurface,
              ),
            ),
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
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Palette.greenShadow),
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
