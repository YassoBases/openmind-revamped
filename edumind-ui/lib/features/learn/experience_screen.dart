import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/app_theme.dart';
import '../../core/middle_palette.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../tutor/ask_hudhud_sheet.dart';
import '../tutor/tutor_models.dart';
import 'learn_evidence_store.dart';
import 'learn_models.dart';
import 'learn_progress_store.dart';
import 'lesson_scoring.dart';
import 'readiness_logic.dart';
import 'support_actions.dart';
import 'widgets/learn_widget_registry.dart';

/// The generic step player: walks one LearnExperience's steps and gates the
/// continue button by step kind (see LearnStep docs). Completing the last
/// step records progress and pops `true` so the path screens can refresh.
/// Each step reached is persisted as the resumable position, so leaving
/// mid-experience makes Home's «تابع التجربة» real.
class ExperienceScreen extends StatefulWidget {
  const ExperienceScreen({
    super.key,
    required this.path,
    required this.experience,
    this.initialStep = 0,
    this.isCheckpoint = false,
  });

  final LearnPath path;
  final LearnExperience experience;

  /// Resume position (from the persisted [LearnProgressStore.resume]).
  final int initialStep;

  /// True when [experience] is a synthetic checkpoint (see checkpoint_logic).
  /// Its evidence is tagged source `checkpoint`, and it never writes a resume
  /// marker — a diagnostic is taken in one sitting.
  final bool isCheckpoint;

  @override
  State<ExperienceScreen> createState() => _ExperienceScreenState();
}

class _ExperienceScreenState extends State<ExperienceScreen> {
  late int _step;
  bool _done = false;

  /// Small per-step stars earned so far this station (see lesson_scoring.dart
  /// and _completion) — a learning signal, never a currency; not persisted
  /// beyond this screen.
  int _stars = 0;

  @override
  void initState() {
    super.initState();
    _step = widget.initialStep.clamp(0, widget.experience.steps.length - 1);
    _checkPicked = List<int?>.filled(_current.checkItems.length, null);
  }

  // Per-step interaction state, reset on advance.
  LearnWidgetStatus _widgetStatus = const LearnWidgetStatus();
  int? _picked;

  // Check-step state: one answer slot per item, walked one item at a time.
  int _checkIndex = 0;
  List<int?> _checkPicked = const [];

  // What the student tried across the experience — tutor-help context.
  final List<String> _attempts = [];

  // Per-step evidence signals, reset on advance. Time-on-task is recorded but
  // never read as low readiness on its own (see EvidenceEvent.ms).
  DateTime _stepStartedAt = DateTime.now();
  int _stepHints = 0; // Hudhud opens during this step
  int _hintRung = 0; // in-place hint-ladder rungs revealed this step (0-3)
  bool _exploreEmitted = false; // explore-interaction is emitted once
  bool _challengeEmitted = false; // challenge target-met is emitted once
  final Set<int> _checkEmitted = {}; // check items already recorded
  final List<String> _checkWrongPatterns = []; // diagnosed misses this check

  LearnStep get _current => widget.experience.steps[_step];
  Color get _accent => hexToColor(widget.path.colorHex);

  /// The learner's context lens. Variants reword the story through it; the
  /// widgets, choices, targets and completion rules never depend on it.
  String? get _lens => Session.instance.learningContext;

  bool get _canContinue {
    final s = _current;
    return switch (s.kind) {
      LearnStepKind.scene => true,
      LearnStepKind.explore => _widgetStatus.interacted,
      LearnStepKind.choice => _picked != null,
      LearnStepKind.challenge => _widgetStatus.targetMet,
      LearnStepKind.apply => s.choice == null || _picked != null,
      // Answered-all, never all-correct: like `choice`, a wrong pick teaches
      // through its feedback instead of blocking the finish.
      LearnStepKind.check => !_checkPicked.contains(null),
    };
  }

  /// In-experience tutor help: OpenMind gets the full learning context —
  /// path, experience, current step, live widget state, prior attempts — and
  /// guides without giving the goal away (enforced server-side by the tutor
  /// prompt). The student stays in the experience; the sheet never advances
  /// steps for them.
  Future<void> _openHelp() async {
    final l = AppLocalizations.of(context)!;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final step = _current;
    // A help open on this step lowers the confidence of its evidence — a
    // correct answer that needed a hint is weighed less than an unaided one.
    _stepHints++;
    // A compact readiness slice for THIS experience's skills — lets Hudhud
    // ground the hint in the weakest one and respond to the diagnosed error
    // pattern (see prompts.ts INSIDE AN EXPERIENCE), never a generic hint.
    final readinessSlice = await _readinessSlice();
    if (!mounted) return;
    openAskHudhud(
      context,
      context_: TutorContext(
        source: 'experience',
        subject: 'الرياضيات',
        pathId: widget.path.id,
        pathTitle: widget.path.title,
        experienceId: widget.experience.id,
        experienceTitle: widget.experience.title,
        concept: widget.experience.subtitle,
        stepKind: step.kind.name,
        // What is actually on the student's screen (lens-resolved wording).
        stepTitle: step.titleFor(_lens),
        state: _widgetStatus.detail,
        attempts: List.of(_attempts),
        skills: step.skills,
        readiness: readinessSlice,
      ),
      seedQuestions: [
        if (rtl) ...const [
          'أنا عالق في هذه الخطوة، أعطني تلميحًا',
          'اشرح لي الفكرة بمثال من الحياة',
        ] else ...const [
          'I am stuck on this step, give me a hint',
          'Explain the idea with a real-life example',
        ],
      ],
      // Mid-lesson quick actions — each one is a real question through the
      // same backend tutor call.
      quickActions: [
        l.translate('qa_hint_only'),
        l.translate('qa_simpler'),
        l.translate('qa_try_again'),
        l.translate('qa_ask_me'),
      ],
    );
  }

  Future<void> _next() async {
    await _recordCheckIfAny();
    final earned = _starsForCurrentStep();
    if (_step < widget.experience.steps.length - 1) {
      setState(() {
        _stars += earned;
        _step++;
        _widgetStatus = const LearnWidgetStatus();
        _picked = null;
        _checkIndex = 0;
        _checkPicked = List<int?>.filled(_current.checkItems.length, null);
        _stepStartedAt = DateTime.now();
        _stepHints = 0;
        _hintRung = 0;
        _exploreEmitted = false;
        _challengeEmitted = false;
        _checkEmitted.clear();
        _checkWrongPatterns.clear();
      });
      // The reached step is the real resumable position (fire-and-forget).
      // A checkpoint is taken in one sitting — it is never resumable.
      if (!widget.isCheckpoint) {
        final store = await LearnProgressStore.load();
        await store.saveResume(widget.path.id, widget.experience.id, _step);
      }
      return;
    }
    final store = await LearnProgressStore.load();
    await store.clearResume(widget.path.id, widget.experience.id);
    await store.markCompleted(widget.path.id, widget.experience.id);
    if (mounted) setState(() { _stars += earned; _done = true; });
  }

  /// Stars for the step being left, read directly off this step's own
  /// interaction state (never the evidence store) — see lesson_scoring.dart.
  int _starsForCurrentStep() {
    final step = _current;
    return switch (step.kind) {
      LearnStepKind.scene => kSceneStars,
      LearnStepKind.explore =>
        starsFor(correct: _widgetStatus.interacted, hintRung: _hintRung),
      LearnStepKind.challenge =>
        starsFor(correct: _widgetStatus.targetMet, hintRung: _hintRung),
      LearnStepKind.choice || LearnStepKind.apply => step.choice == null
          ? kSceneStars
          : starsFor(
              correct: _picked == step.choice!.correctIndex,
              hintRung: _hintRung,
            ),
      LearnStepKind.check => starsForCheck(
          correct: [
            for (var i = 0; i < step.checkItems.length; i++)
              if (_checkPicked[i] == step.checkItems[i].correctIndex) i,
          ].length,
          total: step.checkItems.length,
        ),
    };
  }

  /// Records the leaving step's check score (last write wins on replay).
  /// Recorded, never gated — the score only feeds أنا and tutor context.
  Future<void> _recordCheckIfAny() async {
    final s = _current;
    if (s.kind != LearnStepKind.check || s.checkItems.isEmpty) return;
    var correct = 0;
    for (var i = 0; i < s.checkItems.length; i++) {
      if (_checkPicked[i] == s.checkItems[i].correctIndex) correct++;
    }
    final store = await LearnProgressStore.load();
    await store.saveCheckResult(
        widget.path.id, widget.experience.id, correct, s.checkItems.length);
  }

  /// Appends one evidence event per tagged skill for the current step's
  /// outcome — the readiness signal behind the journey chip and (later)
  /// checkpoints. Fire-and-forget, local-first, never blocks the UI; an
  /// untagged step records nothing. Verification is client_reported: this is
  /// the player's own observation of the outcome (the server-verified rows
  /// come from the tutor and checkpoint paths).
  Future<void> _emitEvidence({
    required List<String> skills,
    required String rep,
    required String kind,
    required String outcome,
    String? errorPattern,
    int attempt = 1,
    bool recovered = false,
  }) async {
    if (skills.isEmpty) return;
    final store = await LearnEvidenceStore.load();
    final now = DateTime.now();
    final ms = now.difference(_stepStartedAt).inMilliseconds;
    for (final skillId in skills) {
      await store.append(EvidenceEvent(
        id: newEvidenceId(),
        skillId: skillId,
        representation: rep,
        context: _lens,
        source: widget.isCheckpoint ? 'checkpoint' : 'learn_step',
        kind: kind,
        outcome: outcome,
        verification: 'client_reported',
        attempt: attempt,
        // Both help paths count: full Ask Hudhud opens and in-place
        // hint-ladder rungs — either means the outcome wasn't unaided.
        hints: _stepHints + _hintRung,
        recovered: recovered,
        errorPattern: errorPattern,
        pathId: widget.path.id,
        experienceId: widget.experience.id,
        stepIndex: _step,
        ms: ms,
        createdAt: now,
      ));
    }
  }

  /// A ≤8-entry readiness slice for the skills this experience touches, each
  /// {skill, rep, level, recentErrorPatterns} — the compact view Hudhud reads.
  Future<List<Map<String, dynamic>>> _readinessSlice() async {
    final expSkills = <String>{};
    for (final s in widget.experience.steps) {
      expSkills.addAll(s.skills);
      for (final item in s.checkItems) {
        expSkills.addAll(item.skills);
      }
    }
    if (expSkills.isEmpty) return const [];
    final store = await LearnEvidenceStore.load();
    final readiness = deriveReadiness(store.events);
    final slice = <Map<String, dynamic>>[];
    for (final r in readiness.values) {
      if (!expSkills.contains(r.skillId) || r.level == ReadinessLevel.unseen) {
        continue;
      }
      slice.add({
        'skill': r.skillId,
        'rep': r.representation,
        'level': r.level.name,
        if (r.recentErrorPatterns.isNotEmpty)
          'recentErrorPatterns': r.recentErrorPatterns,
      });
      if (slice.length >= 8) break;
    }
    return slice;
  }

  /// Widget status callback: keeps the gate state and emits the two
  /// widget-driven signals once each — exploration when the learner first
  /// touches an explore manipulative, construction when a challenge target
  /// is first reached.
  void _onWidgetStatus(LearnWidgetStatus status) {
    setState(() => _widgetStatus = status);
    final step = _current;
    if (step.kind == LearnStepKind.explore &&
        status.interacted &&
        !_exploreEmitted) {
      _exploreEmitted = true;
      _emitEvidence(
        skills: step.skills,
        rep: step.representation,
        kind: step.evidenceKind,
        outcome: 'explored',
      );
    } else if (step.kind == LearnStepKind.challenge &&
        status.targetMet &&
        !_challengeEmitted) {
      _challengeEmitted = true;
      _emitEvidence(
        skills: step.skills,
        rep: step.representation,
        kind: step.evidenceKind,
        outcome: 'correct',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: MiddlePalette.cream,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: _done ? _completion(l) : _player(l),
        ),
      ),
    );
  }

  Widget _player(AppLocalizations l) {
    final steps = widget.experience.steps;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              tooltip: MaterialLocalizations.of(context).backButtonTooltip,
              icon: const BackButtonIcon(),
              onPressed: () => Navigator.of(context).pop(false),
            ),
            Expanded(
              child: Row(
                children: [
                  for (var i = 0; i < steps.length; i++)
                    Expanded(
                      child: Container(
                        height: 6,
                        margin: const EdgeInsetsDirectional.only(end: 5),
                        decoration: BoxDecoration(
                          // Progress is always the discovery/progress color —
                          // never the path's own identity color — so "how far
                          // am I" reads the same on every path.
                          color: i <= _step
                              ? MiddlePalette.discovery
                              : Theme.of(context).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            AskHudhudEntry(onPressed: _openHelp, color: MiddlePalette.primaryAction),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          l.translateWith('learn_step_progress', {'n': '${_step + 1}', 'm': '${steps.length}'}),
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            color: MiddlePalette.body,
          ),
        ),
        if (widget.isCheckpoint) ...[
          const SizedBox(height: 10),
          _checkpointBanner(l),
        ],
        const SizedBox(height: 10),
        Expanded(
          child: _current.kind == LearnStepKind.scene
              // A pure-narrative step has no widget/choice to anchor the eye,
              // so it gets a real focal point (the badge) and sits centered
              // in the available height instead of top-pinned with a dead
              // gap above the continue button.
              ? Center(child: SingleChildScrollView(child: _sceneBody(_current)))
              : SingleChildScrollView(child: _stepBody(_current)),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _canContinue ? _next : null,
          style: FilledButton.styleFrom(
            // The one primary action per step: always this fixed blue, never
            // the path's personalization color, so a learner always knows
            // which button is "the" next tap.
            backgroundColor: MiddlePalette.primaryAction,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(Palette.radiusButton),
            ),
          ),
          child: Text(
            _step == steps.length - 1
                ? l.translate('learn_finish')
                : l.translate('learn_continue'),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }

  /// One small "what kind of step is this, what do I do" tag — scene,
  /// explore (+ challenge), and decision (choice/apply/check) each get their
  /// own icon, label and color so the four step families are told apart at a
  /// glance, not just by their layout. Purely presentational: it reads
  /// [LearnStepKind], it never changes gating or content.
  Widget _kindBadge(LearnStepKind kind, AppLocalizations l) {
    final (label, hint, icon, color) = switch (kind) {
      LearnStepKind.scene => (
          'learn_kind_scene',
          'learn_hint_scene',
          Icons.auto_stories_rounded,
          MiddlePalette.blueInk,
        ),
      LearnStepKind.explore || LearnStepKind.challenge => (
          'learn_kind_explore',
          'learn_hint_explore',
          Icons.touch_app_rounded,
          MiddlePalette.discovery,
        ),
      LearnStepKind.choice || LearnStepKind.apply => (
          'learn_kind_decision',
          'learn_hint_decision',
          Icons.help_rounded,
          MiddlePalette.primaryAction,
        ),
      LearnStepKind.check => (
          'learn_kind_decision',
          'learn_hint_check',
          Icons.help_rounded,
          MiddlePalette.primaryAction,
        ),
    };
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 8,
      runSpacing: 4,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 13, color: color),
              const SizedBox(width: 4),
              Text(
                l.translate(label),
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: color),
              ),
            ],
          ),
        ),
        Text(
          l.translate(hint),
          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: MiddlePalette.body),
        ),
      ],
    );
  }

  /// Top-of-screen banner shown only when [widget.isCheckpoint] — a checkpoint
  /// experience is a distinct kind of moment (a diagnostic, not a lesson), so
  /// it gets its own fixed, primary-blue banner rather than blending into the
  /// ordinary step chrome.
  Widget _checkpointBanner(AppLocalizations l) {
    const color = MiddlePalette.primaryAction;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        border: Border.all(color: color.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(Palette.radiusButton),
      ),
      child: Row(
        children: [
          const Text('🎯', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.translate('checkpoint_title'),
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: color),
                ),
                Text(
                  l.translate('checkpoint_sub'),
                  style: const TextStyle(fontSize: 11.5, height: 1.4, color: MiddlePalette.body),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// A pure-narrative beat (no manipulative, no choice): one clear focal
  /// point instead of a stray inline glyph over empty space.
  Widget _sceneBody(LearnStep step) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final emoji = step.emojiFor(_lens);
    final body = step.bodyFor(_lens);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _kindBadge(step.kind, l),
        const SizedBox(height: 14),
        if (emoji != null) ...[
          Container(
            width: 92,
            height: 92,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _accent.withValues(alpha: 0.12),
              border: Border.all(color: _accent.withValues(alpha: 0.5), width: 2),
            ),
            child: Text(emoji, style: const TextStyle(fontSize: 42)),
          ),
          const SizedBox(height: 18),
        ],
        Text(
          step.titleFor(_lens),
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.5),
        ),
        if (body.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            body,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 15, height: 1.7, color: cs.onSurfaceVariant),
          ),
        ],
      ],
    );
  }

  Widget _stepBody(LearnStep step) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final emoji = step.emojiFor(_lens);
    final body = step.bodyFor(_lens);
    final successText = step.successTextFor(_lens);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _kindBadge(step.kind, l),
        const SizedBox(height: 12),
        if (emoji != null) ...[
          Text(emoji, style: const TextStyle(fontSize: 44)),
          const SizedBox(height: 8),
        ],
        Text(
          step.titleFor(_lens),
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, height: 1.5),
        ),
        if (body.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            body,
            style: TextStyle(fontSize: 15, height: 1.7, color: cs.onSurfaceVariant),
          ),
        ],
        if (step.widget != null) ...[
          const SizedBox(height: 14),
          buildLearnWidget(step.widget!, _onWidgetStatus),
          if (step.kind == LearnStepKind.challenge &&
              _widgetStatus.targetMet &&
              successText != null) ...[
            const SizedBox(height: 10),
            Center(
              child: Text(
                successText,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.mutedGreen,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ),
          ],
        ],
        if (step.choice != null) ...[
          const SizedBox(height: 14),
          _choiceBlock(step.choice!),
        ],
        if (step.kind == LearnStepKind.check && step.checkItems.isNotEmpty) ...[
          const SizedBox(height: 14),
          _checkBlock(step),
        ],
        _hintLadder(step),
      ],
    );
  }

  /// The 3-level hint ladder — observation → next-step → stronger scaffold —
  /// revealed one rung at a time so a learner who only needs a nudge doesn't
  /// see the whole scaffold. Authored per step (learn_models.LearnStep.hints);
  /// a step with none renders nothing. Once every rung is open, the existing
  /// «اسأل هدهد» entry in the app bar is the natural next move — this never
  /// adds a second help entry point.
  Widget _hintLadder(LearnStep step) {
    if (step.hints.isEmpty) return const SizedBox.shrink();
    final l = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < _hintRung && i < step.hints.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: MiddlePalette.softBlue,
                  borderRadius: BorderRadius.circular(Palette.radiusButton),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.lightbulb_rounded,
                        size: 17, color: MiddlePalette.discovery),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        step.hints[i],
                        style: const TextStyle(
                          fontSize: 13.5,
                          height: 1.6,
                          fontWeight: FontWeight.w600,
                          color: MiddlePalette.blueInk,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (_hintRung < step.hints.length)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () => setState(() => _hintRung++),
                icon: const Icon(Icons.lightbulb_outline_rounded,
                    size: 17, color: MiddlePalette.primaryAction),
                label: Text(
                  l.translate(_hintRung == 0 ? 'learn_hint_ask' : 'learn_hint_more'),
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: MiddlePalette.primaryAction,
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
        ],
      ),
    );
  }

  /// «تحقق من الفهم»: the step's items one at a time, with a sub-progress
  /// line. Feedback teaches either way; the score is summarized at the end
  /// and a weak one offers the tutor — it never blocks finishing.
  Widget _checkBlock(LearnStep step) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final items = step.checkItems;
    final item = items[_checkIndex];
    final answered = _checkPicked[_checkIndex] != null;
    final allAnswered = !_checkPicked.contains(null);
    var correct = 0;
    for (var i = 0; i < items.length; i++) {
      if (_checkPicked[i] == items[i].correctIndex) correct++;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              l
                  .translate('learn_check_item')
                  .replaceFirst('{n}', '${_checkIndex + 1}')
                  .replaceFirst('{m}', '${items.length}'),
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: cs.onSurfaceVariant,
              ),
            ),
            const Spacer(),
            for (var i = 0; i < items.length; i++)
              Container(
                width: 8,
                height: 8,
                margin: const EdgeInsetsDirectional.only(start: 5),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _checkPicked[i] != null
                      ? MiddlePalette.discovery
                      : cs.surfaceContainerHighest,
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        _itemBlock(
          item,
          picked: _checkPicked[_checkIndex],
          onPick: (i) {
            final idx = _checkIndex;
            setState(() {
              _checkPicked[idx] = i;
              if (i != item.correctIndex) {
                _attempts.add('${item.prompt} → ${item.options[i]}');
              }
            });
            if (_checkEmitted.add(idx)) {
              final step = _current;
              final correct = i == item.correctIndex;
              final pattern = correct ? null : item.patternFor(i);
              if (pattern != null) _checkWrongPatterns.add(pattern);
              _emitEvidence(
                // A check item may narrow to its own skills; else inherit.
                skills: item.skills.isNotEmpty ? item.skills : step.skills,
                rep: item.rep ?? step.representation,
                kind: step.evidenceKind,
                outcome: correct ? 'correct' : 'incorrect',
                errorPattern: pattern,
              );
            }
          },
        ),
        if (answered && _checkIndex < items.length - 1) ...[
          const SizedBox(height: 10),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton.tonal(
              onPressed: () => setState(() => _checkIndex++),
              child: Text(l.translate('learn_check_next')),
            ),
          ),
        ],
        if (allAnswered) ...[
          const SizedBox(height: 14),
          Text(
            l
                .translate('learn_check_score')
                .replaceFirst('{c}', '$correct')
                .replaceFirst('{m}', '${items.length}'),
            style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
          ),
          // A diagnosed miss gets a specific next move, not a generic "review".
          if (_dominantSupport() case final action?) ...[
            const SizedBox(height: 8),
            _supportHint(action, l),
          ],
          if (correct * 2 < items.length)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: _openHelp,
                icon: const Icon(Icons.support_agent_rounded, size: 18, color: MiddlePalette.primaryAction),
                label: Text(l.translate('learn_check_review')),
              ),
            ),
        ],
      ],
    );
  }

  /// The support action for the most common diagnosed miss in this check, or
  /// null when every wrong pick was untagged (nothing specific to say).
  SupportAction? _dominantSupport() {
    if (_checkWrongPatterns.isEmpty) return null;
    final counts = <String, int>{};
    for (final p in _checkWrongPatterns) {
      counts[p] = (counts[p] ?? 0) + 1;
    }
    final top = counts.entries.reduce((a, b) => a.value >= b.value ? a : b).key;
    return supportForPattern(top);
  }

  /// A calm, specific "here's your next move" line — the diagnosis made
  /// actionable, distinct from the generic tutor offer.
  Widget _supportHint(SupportAction action, AppLocalizations l) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: MiddlePalette.primaryAction.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(Palette.radiusButton),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.lightbulb_outline_rounded, size: 18, color: MiddlePalette.primaryAction),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              l.translate(supportMessageKey(action)),
              style: TextStyle(height: 1.6, fontWeight: FontWeight.w600, color: cs.onSurface),
            ),
          ),
        ],
      ),
    );
  }

  Widget _choiceBlock(LearnChoice choice) => _itemBlock(
        choice,
        picked: _picked,
        onPick: (i) {
          setState(() {
            _picked = i;
            if (i != choice.correctIndex) {
              _attempts.add('${choice.prompt} → ${choice.options[i]}');
            }
          });
          final step = _current;
          final correct = i == choice.correctIndex;
          // The step kind sets the evidence kind: a `choice` step is a
          // prediction, an `apply` step's choice is transfer evidence.
          _emitEvidence(
            skills: step.skills,
            rep: choice.rep ?? step.representation,
            kind: step.evidenceKind,
            outcome: correct ? 'correct' : 'incorrect',
            errorPattern: correct ? null : choice.patternFor(i),
          );
        },
      );

  /// One answerable question: prompt, options, feedback either way. Shared
  /// by the step-level choice and the check items — same look, same rules.
  Widget _itemBlock(
    LearnChoice choice, {
    required int? picked,
    required ValueChanged<int> onPick,
  }) {
    final answered = picked != null;
    final correct = picked == choice.correctIndex;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          choice.prompt,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, height: 1.6),
        ),
        const SizedBox(height: 10),
        for (var i = 0; i < choice.options.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _option(choice, i, picked: picked, onPick: onPick),
          ),
        if (answered) ...[
          const SizedBox(height: 4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              // Correct stays the one true success green; anything else is
              // the soft learning-yellow retry treatment — never red/amber/
              // orange, a wrong pick is a teaching moment, not an alarm.
              color: correct
                  ? AppColors.mutedGreen.withValues(alpha: 0.12)
                  : AppColors.retryYellowSoft,
              borderRadius: BorderRadius.circular(Palette.radiusButton),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  correct ? Icons.check_circle_rounded : Icons.refresh_rounded,
                  size: 18,
                  color: correct ? AppColors.mutedGreen : AppColors.retryYellowInk,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    correct ? choice.correctFeedback : choice.wrongFeedback,
                    style: TextStyle(
                      height: 1.6,
                      fontWeight: FontWeight.w600,
                      color: correct ? AppColors.mutedGreen : AppColors.retryYellowInk,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _option(
    LearnChoice choice,
    int i, {
    required int? picked,
    required ValueChanged<int> onPick,
  }) {
    final cs = Theme.of(context).colorScheme;
    final answered = picked != null;
    final isPicked = picked == i;
    final isRight = i == choice.correctIndex;

    Color border = cs.outlineVariant;
    Color? fill;
    if (answered && isRight) {
      border = AppColors.mutedGreen;
      fill = AppColors.mutedGreen.withValues(alpha: 0.10);
    } else if (answered && isPicked) {
      border = AppColors.retryYellow;
      fill = AppColors.retryYellowSoft;
    }

    return InkWell(
      borderRadius: BorderRadius.circular(Palette.radiusButton),
      onTap: answered ? null : () => onPick(i),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        decoration: BoxDecoration(
          color: fill,
          border: Border.all(color: border, width: 1.6),
          borderRadius: BorderRadius.circular(Palette.radiusButton),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                choice.options[i],
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.5),
              ),
            ),
            if (answered && isRight)
              const Icon(Icons.check_circle_rounded, size: 20, color: AppColors.mutedGreen)
            else if (answered && isPicked)
              const Icon(Icons.cancel_rounded, size: 20, color: AppColors.retryYellowInk),
          ],
        ),
      ),
    );
  }

  /// A calm, age-appropriate completion moment: no mascots, one next action.
  Widget _completion(AppLocalizations l) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _accent.withValues(alpha: 0.12),
              border: Border.all(color: _accent.withValues(alpha: 0.5), width: 2),
            ),
            child: Icon(Icons.check_rounded, size: 48, color: _accent),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          l.translate('learn_done_title'),
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 8),
        Text(
          '${l.translate('learn_done_body')} "${widget.experience.title}"',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 15,
            height: 1.7,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 16),
        // Small stars, not a coin count — a quick "how did that go" read.
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.star_rounded, color: MiddlePalette.discovery, size: 20),
            const SizedBox(width: 6),
            Text(
              l.translateWith('learn_stars_earned', {'n': '$_stars'}),
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: MiddlePalette.discovery,
              ),
            ),
          ],
        ),
        // The value added — what this station was actually good for — not
        // only the score, per the authored valueNote (see learn_models.dart).
        if (widget.experience.valueNote case final note?) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: MiddlePalette.softBlue,
              borderRadius: BorderRadius.circular(Palette.radiusCard),
            ),
            child: Text(
              note,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13.5,
                height: 1.7,
                fontWeight: FontWeight.w600,
                color: MiddlePalette.blueInk,
              ),
            ),
          ),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(
            backgroundColor: MiddlePalette.primaryAction,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(Palette.radiusButton),
            ),
          ),
          child: Text(
            l.translate('learn_back_to_path'),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}
