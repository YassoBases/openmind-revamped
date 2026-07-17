import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/app_theme.dart';
import '../../core/palette.dart';
import '../../core/registration_sync.dart';
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

  /// True once this turn's interactive block is CLOSED: the server verified a
  /// completing outcome, the retry budget is spent, or the instance was
  /// superseded. A wrong answer alone never freezes the block — the learner
  /// may retry (the server enforces the budget either way).
  bool resultSent = false;

  /// Bumped when a block submission FAILED to reach the server — the block
  /// clears its local verdict so the learner can genuinely resubmit
  /// (nothing was counted server-side).
  int resetEpoch = 0;

  /// True once the server acknowledged a result for this block — only then
  /// does the block show its "sent to your tutor" note.
  bool resultAcked = false;

  /// Accepted attempts the server counted for this instance (live or
  /// restored) — shown so the learner can see the remaining budget.
  int attempts = 0;
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
    this.showStudyModes = false,
    this.isHelpSheet = false,
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

  /// Ask tab only: offer the five study programs (kStudyModes) before the
  /// conversation starts. Picking one sends its localized label as the
  /// opening message and attaches the STABLE id as TutorContext.mode on every
  /// turn of the conversation. The in-lesson help sheet keeps this false —
  /// its contextual quick actions are untouched.
  final bool showStudyModes;

  /// True only for the in-lesson help sheet (openAskHudhud): swaps the long
  /// main-screen welcome for a short one-line greeting. Everything else —
  /// input, quick actions, study modes — is unaffected by this flag.
  final bool isHelpSheet;

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

  /// Active study program — a STABLE kStudyModes id, or null for free chat.
  /// Rides every message of this conversation as TutorContext.mode; program
  /// logic keys on it, never on the (display-only) Arabic label.
  String? _studyMode;

  /// The active study program id, for tests and the Ask screen chrome.
  String? get activeStudyMode => _studyMode;

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
      // Resume the running study program (2.1): the server echoes the last
      // student turn's mode id; accept only ids this client knows.
      final restoredMode = res['mode'];
      if (restoredMode is String && kStudyModes.any((m) => m.id == restoredMode)) {
        _studyMode = restoredMode;
      }
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
          // COMPLETED restored interactions stay frozen: a later result of
          // the same type with a completing outcome closes this instance, and
          // so does a newer offer of the same type (the server only accepts
          // results for the newest instance). A wrong-only history restores
          // live — the learner may still retry it, and sees how many of the
          // budgeted attempts are already spent.
          final type = turn.reply?.interactivePayload?.type;
          if (type != null) {
            final state = _restoredInstanceState(messages, i, type);
            turn.resultSent = state.closed;
            turn.attempts = state.attempts;
            turn.resultAcked = state.attempts > 0;
          }
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

  /// Mirrors the server's per-instance retry budget (tutor/result.ts) so a
  /// restored thread freezes exactly the blocks the server would reject.
  static const _maxBlockAttempts = 3;

  /// The restored attempt state of the block offered by the tutor turn at
  /// [index]: closed when no further attempt can land — completed
  /// (correct/explored result), retry budget spent, or superseded by a newer
  /// instance of the same type — plus how many accepted attempts the server
  /// already counted (so an open block can show its remaining budget).
  ({bool closed, int attempts}) _restoredInstanceState(
    List<Map<String, dynamic>> messages,
    int index,
    String blockType,
  ) {
    var attempts = 0;
    for (final later in messages.skip(index + 1)) {
      if (later['role'] == 'tutor') {
        final payload = later['interactivePayload'];
        if (payload is Map && payload['type'] == blockType) {
          return (closed: true, attempts: attempts); // superseded
        }
        continue;
      }
      final result = later['interactiveResult'];
      if (result is! Map || result['blockType'] != blockType) continue;
      attempts++;
      final outcome = result['correctnessOrOutcome'];
      if (outcome == 'correct' || outcome == 'explored') {
        return (closed: true, attempts: attempts); // completed
      }
    }
    return (closed: attempts >= _maxBlockAttempts, attempts: attempts);
  }

  /// Starts a new conversation (the old thread stays on the server).
  Future<void> clearConversation() async {
    setState(() {
      _turns.clear();
      _conversationId = null;
      _studyMode = null; // a fresh conversation starts outside any program
    });
    if (widget.persistThread) {
      await Session.instance.setTutorConversationId(null);
    }
  }

  /// Enters a study program: the localized label becomes the visible opening
  /// message; the STABLE [modeId] becomes TutorContext.mode from here on.
  /// If the opening message never reaches the server (rate limit, offline),
  /// the program is rolled back — no chip for a program that never started.
  Future<void> _startStudyMode(String modeId, String label) async {
    setState(() => _studyMode = modeId);
    await send(label);
    if (!_lastSendSucceeded && mounted) {
      setState(() => _studyMode = null);
    }
  }

  /// The context map for an outgoing message: the widget's context plus the
  /// active study mode. The stable id is attached here — never the label.
  Map<String, dynamic>? _contextMap() {
    Map<String, dynamic>? map = widget.context_?.toMap();
    if (_studyMode != null) {
      (map ??= {'source': 'ask'})['mode'] = _studyMode;
    }
    return map;
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

  /// Whether the most recent [_send] reached the server and got a reply —
  /// lets a failed program-opening message roll the program back.
  bool _lastSendSucceeded = false;

  Future<void> send([String? text, InteractiveResult? interactiveResult]) =>
      _send(text, interactiveResult, null);

  Future<void> _send(
    String? text,
    InteractiveResult? interactiveResult,
    _Turn? blockTurn,
  ) async {
    final l = AppLocalizations.of(context)!;
    final q = (text ?? _input.text).trim();
    if (q.isEmpty || _sending) return;
    _input.clear();
    _lastSendSucceeded = false;
    setState(() {
      _turns.add(_Turn.student(q));
      _sending = true;
    });
    _scrollDown();

    // The account may have finished registering since this screen last
    // rebuilt (a background retry from EduMindRoot, or connectivity just
    // came back) — a quick check-and-retry here means the learner doesn't
    // have to leave and come back for a pending registration to resolve.
    if (RegistrationSync.isPending) await RegistrationSync.retry();
    if (!Session.instance.registered) {
      setState(() {
        _turns.add(_Turn.error(l.translate('tutor_offline')));
        _sending = false;
      });
      _scrollDown();
      return;
    }

    try {
      final contextMap = _contextMap();
      final res = await Api.askTutor({
        'question': q,
        if (_conversationId != null) 'conversationId': _conversationId,
        if (contextMap != null) 'context': contextMap,
        if (interactiveResult != null) 'interactiveResult': interactiveResult.toMap(),
      });
      final result = TutorAskResult.fromMap(res);
      _conversationId = result.conversationId;
      if (widget.persistThread) {
        await Session.instance.setTutorConversationId(result.conversationId);
      }
      // The server owns the freeze/retry decision: a completed or exhausted
      // instance closes; a wrong answer stays open for another try. An older
      // server (no assessment) freezes — the safe pre-retry behavior.
      if (blockTurn != null) {
        final assessment = result.assessment;
        blockTurn.resultSent = assessment?.closed ?? true;
        blockTurn.resultAcked = true;
        blockTurn.attempts = assessment?.attempt ?? (blockTurn.attempts + 1);
      }
      _lastSendSucceeded = true;
      setState(() => _turns.add(_Turn.tutor(result.reply)));
    } on ApiException catch (e) {
      setState(() {
        // The submission never reached the tutor: reset the block's local
        // verdict so the learner can genuinely resubmit — nothing was
        // counted server-side, and no "sent" note may pretend otherwise.
        blockTurn?.resetEpoch++;
        _turns.add(_Turn.error(
            e.code == 'RATE_LIMITED' ? l.translate('tutor_rate_limited') : l.translate('tutor_error')));
      });
    } catch (_) {
      setState(() {
        blockTurn?.resetEpoch++;
        _turns.add(_Turn.error(l.translate('tutor_error')));
      });
    } finally {
      setState(() => _sending = false);
      _scrollDown();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    // The student's personal accent — a small touch on a few interactive
    // elements here (send button, active-program marker, quick-action
    // chips) only. Never the surfaces, mascot, or brand typography.
    final accent = hexToColor(Session.instance.color);
    return Column(
      children: [
        Expanded(
          child: _restoring
              ? const Center(child: CircularProgressIndicator())
              : _turns.isEmpty
                  ? _emptyState(l, cs, accent)
                  : _conversation(cs),
        ),
        // A small always-visible marker of the running study program.
        if (_studyMode != null && _turns.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 4),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: cs.primary.withValues(alpha: 0.08),
                  border: Border.all(color: accent, width: 1.2),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      kStudyModes.firstWhere((m) => m.id == _studyMode).emoji,
                      style: const TextStyle(fontSize: 13),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      l.translate('mode_$_studyMode'),
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                        color: cs.primary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        // Quick actions are free-chat moves ("give me a hint", "simpler") —
        // irrelevant mid-program, so they hide while a study mode runs.
        if (_turns.isNotEmpty && widget.quickActions.isNotEmpty && _studyMode == null)
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
                      backgroundColor: accent.withValues(alpha: 0.08),
                      side: BorderSide(color: accent.withValues(alpha: 0.5)),
                      onPressed: _sending ? null : () => send(action),
                    ),
                  ),
              ],
            ),
          ),
        // Mid-conversation program entry: once the learner has started free
        // chat the five cards are gone, but a program stays one tap away —
        // same thread, same send path, never a second chat system.
        if (widget.showStudyModes && _turns.isNotEmpty && _studyMode == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 4),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: _sending ? null : _pickStudyModeSheet,
                icon: Icon(Icons.school_rounded, size: 16, color: cs.primary),
                label: Text(
                  l.translate('study_modes_title'),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: cs.primary,
                  ),
                ),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  visualDensity: VisualDensity.compact,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
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
                  style: IconButton.styleFrom(
                    backgroundColor: accent,
                    foregroundColor: onAccentColor(accent),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _emptyState(AppLocalizations l, ColorScheme cs, Color accent) {
    // Hudhud fronts every "Ask" moment — calmer and smaller for middle
    // schoolers, warm and expressive for primary — never a generic icon.
    final middle =
        Session.instance.stage == LearningStage.middleInteractiveLearning;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 8),
          // Clear, non-blocking status: the account hasn't finished
          // registering yet (offline onboarding, or the server was
          // unreachable). RegistrationSync retries this automatically in
          // the background (app startup, resume, and right before a real
          // send attempt) — this banner just keeps the learner honestly
          // informed meanwhile, never blocking the rest of the app.
          if (!Session.instance.registered) _pendingRegistrationBanner(l, cs),
          if (middle)
            Mascot(size: 64, accent: cs.primary, expression: MascotExpression.idle)
          else
            const Mascot(size: 96, expression: MascotExpression.happy),
          const SizedBox(height: 10),
          Text(
            l.translate(widget.isHelpSheet ? 'tutor_sheet_welcome' : 'tutor_welcome'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14.5, height: 1.7, color: cs.onSurfaceVariant),
          ),
          // The five study programs — offered BEFORE the conversation starts.
          // One tap enters the program through the same TutorChat send path;
          // there is no separate chat system per mode.
          if (widget.showStudyModes) ...[
            const SizedBox(height: 18),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                l.translate('study_modes_title'),
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 8),
            for (final mode in kStudyModes)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _modeCard(mode, l, cs),
              ),
          ],
          // One "start here" affordance, not two: when the study programs are
          // offered they ARE the entry point — the seed chips only render on
          // surfaces without the program picker (choice overload on phones).
          if (!widget.showStudyModes) ...[
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                for (final q in widget.seedQuestions)
                  ActionChip(
                    label: Text(q, style: const TextStyle(fontSize: 12.5)),
                    backgroundColor: accent.withValues(alpha: 0.08),
                    side: BorderSide(color: accent.withValues(alpha: 0.5)),
                    onPressed: () => send(q),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _pendingRegistrationBanner(AppLocalizations l, ColorScheme cs) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_rounded, size: 16, color: cs.onSurfaceVariant),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              l.translate('tutor_pending_registration'),
              style: TextStyle(fontSize: 12, height: 1.5, color: cs.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }

  /// The five programs in a bottom sheet — the mid-conversation entry point
  /// (the empty-state cards are gone once any message exists).
  void _pickStudyModeSheet() {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      // Five cards can exceed a short viewport — the sheet must scroll,
      // never overflow.
      isScrollControlled: true,
      builder: (sheetCtx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l.translate('study_modes_title'),
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              for (final mode in kStudyModes)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _modeCard(mode, l, cs, beforeStart: () => Navigator.of(sheetCtx).pop()),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// One tappable study-program card: emoji, localized label, one-line
  /// description. The tap carries the STABLE id; the label is display only.
  Widget _modeCard(
    ({String id, String emoji}) mode,
    AppLocalizations l,
    ColorScheme cs, {
    VoidCallback? beforeStart,
  }) {
    final label = l.translate('mode_${mode.id}');
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: _sending
          ? null
          : () {
              beforeStart?.call();
              _startStudyMode(mode.id, label);
            },
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: cs.surface,
          border: Border.all(color: cs.outlineVariant),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Text(mode.emoji, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                  ),
                  Text(
                    l.translate('mode_${mode.id}_desc'),
                    style: TextStyle(fontSize: 12, height: 1.5, color: cs.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            // arrow_forward_ios mirrors with text direction (RTL-aware).
            Icon(Icons.arrow_forward_ios_rounded, size: 14, color: cs.onSurfaceVariant),
          ],
        ),
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
                    resetEpoch: turn.resetEpoch,
                    acked: turn.resultAcked,
                    priorAttempts: turn.attempts,
                    onResult: (result, summary) {
                      if (turn.resultSent || _sending) return;
                      // The turn stays open until the server's assessment
                      // says the instance is closed (see _send) — a wrong
                      // answer keeps the block retryable.
                      _send(summary, result, turn);
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
    // "next step" points FORWARD in the reading direction — a fixed left
    // arrow reads as "back" in LTR.
    final forwardArrow = Directionality.of(context) == TextDirection.rtl
        ? Icons.arrow_circle_left_outlined
        : Icons.arrow_circle_right_outlined;
    final (key, icon) = switch (type) {
      TutorResponseType.explanation => ('tutor_type_explanation', Icons.menu_book_rounded),
      TutorResponseType.hint => ('tutor_type_hint', Icons.lightbulb_rounded),
      TutorResponseType.question => ('tutor_type_question', Icons.help_outline_rounded),
      TutorResponseType.encouragement => ('tutor_type_encouragement', Icons.celebration_rounded),
      TutorResponseType.correction => ('tutor_type_correction', Icons.build_circle_outlined),
      TutorResponseType.nextStep => ('tutor_type_next_step', forwardArrow),
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
