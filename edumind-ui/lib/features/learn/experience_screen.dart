import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/app_theme.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../tutor/tutor_chat.dart';
import '../tutor/tutor_models.dart';
import 'learn_models.dart';
import 'learn_progress_store.dart';
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
  });

  final LearnPath path;
  final LearnExperience experience;

  /// Resume position (from the persisted [LearnProgressStore.resume]).
  final int initialStep;

  @override
  State<ExperienceScreen> createState() => _ExperienceScreenState();
}

class _ExperienceScreenState extends State<ExperienceScreen> {
  late int _step;
  bool _done = false;

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
  void _openHelp() {
    final l = AppLocalizations.of(context)!;
    final step = _current;
    final ctx = TutorContext(
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
    );
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(sheetCtx).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(sheetCtx).size.height * 0.72,
          child: Column(
            children: [
              Text(
                l.translate('tutor_help_title'),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Expanded(
                child: TutorChat(
                  context_: ctx,
                  seedQuestions: [
                    if (Directionality.of(context) == TextDirection.rtl) ...const [
                      'أنا عالق في هذه الخطوة، أعطني تلميحًا',
                      'اشرح لي الفكرة بمثال من الحياة',
                    ] else ...const [
                      'I am stuck on this step, give me a hint',
                      'Explain the idea with a real-life example',
                    ],
                  ],
                  // Mid-lesson quick actions — each one is a real question
                  // through the same backend tutor call.
                  quickActions: [
                    l.translate('qa_hint_only'),
                    l.translate('qa_simpler'),
                    l.translate('qa_try_again'),
                    l.translate('qa_ask_me'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _next() async {
    await _recordCheckIfAny();
    if (_step < widget.experience.steps.length - 1) {
      setState(() {
        _step++;
        _widgetStatus = const LearnWidgetStatus();
        _picked = null;
        _checkIndex = 0;
        _checkPicked = List<int?>.filled(_current.checkItems.length, null);
      });
      // The reached step is the real resumable position (fire-and-forget).
      final store = await LearnProgressStore.load();
      await store.saveResume(widget.path.id, widget.experience.id, _step);
      return;
    }
    final store = await LearnProgressStore.load();
    await store.clearResume(widget.path.id, widget.experience.id);
    await store.markCompleted(widget.path.id, widget.experience.id);
    if (mounted) setState(() => _done = true);
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

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
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
                          color: i <= _step
                              ? _accent
                              : Theme.of(context).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            IconButton(
              tooltip: l.translate('learn_need_help'),
              icon: Icon(Icons.support_agent_rounded, color: _accent),
              onPressed: _openHelp,
            ),
          ],
        ),
        const SizedBox(height: 10),
        Expanded(child: SingleChildScrollView(child: _stepBody(_current))),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _canContinue ? _next : null,
          style: FilledButton.styleFrom(
            backgroundColor: _accent,
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

  Widget _stepBody(LearnStep step) {
    final cs = Theme.of(context).colorScheme;
    final emoji = step.emojiFor(_lens);
    final body = step.bodyFor(_lens);
    final successText = step.successTextFor(_lens);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
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
          buildLearnWidget(
            step.widget!,
            (status) => setState(() => _widgetStatus = status),
          ),
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
      ],
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
                      ? _accent
                      : cs.surfaceContainerHighest,
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        _itemBlock(
          item,
          picked: _checkPicked[_checkIndex],
          onPick: (i) => setState(() {
            _checkPicked[_checkIndex] = i;
            if (i != item.correctIndex) {
              _attempts.add('${item.prompt} → ${item.options[i]}');
            }
          }),
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
          if (correct * 2 < items.length)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: _openHelp,
                icon: Icon(Icons.support_agent_rounded, size: 18, color: _accent),
                label: Text(l.translate('learn_check_review')),
              ),
            ),
        ],
      ],
    );
  }

  Widget _choiceBlock(LearnChoice choice) => _itemBlock(
        choice,
        picked: _picked,
        onPick: (i) => setState(() {
          _picked = i;
          if (i != choice.correctIndex) {
            _attempts.add('${choice.prompt} → ${choice.options[i]}');
          }
        }),
      );

  /// One answerable question: prompt, options, feedback either way. Shared
  /// by the step-level choice and the check items — same look, same rules.
  Widget _itemBlock(
    LearnChoice choice, {
    required int? picked,
    required ValueChanged<int> onPick,
  }) {
    final cs = Theme.of(context).colorScheme;
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
              color: (correct ? AppColors.mutedGreen : AppColors.mutedRed).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(Palette.radiusButton),
            ),
            child: Text(
              correct ? choice.correctFeedback : choice.wrongFeedback,
              style: TextStyle(
                height: 1.6,
                fontWeight: FontWeight.w600,
                color: correct ? AppColors.mutedGreen : cs.onSurface,
              ),
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
      border = AppColors.mutedRed;
      fill = AppColors.mutedRed.withValues(alpha: 0.10);
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
        child: Text(
          choice.options[i],
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.5),
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
        const SizedBox(height: 24),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(
            backgroundColor: _accent,
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
