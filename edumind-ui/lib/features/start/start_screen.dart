import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/middle_palette.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../context/context_sheet.dart';
import '../learn/experience_screen.dart';
import '../learn/journey_logic.dart';
import '../learn/learn_catalog.dart';
import '../learn/learn_models.dart';
import '../learn/learn_progress_store.dart';

/// The middle-school Home: one meaningful learning moment. A calm greeting,
/// the context-lens chip (bottom sheet, not a tab), and a single primary
/// action whose label is honest about the learner's real state:
/// «تابع التجربة» only when a persisted mid-experience position exists,
/// «استكشف المفهوم التالي» when the path is already in progress, and
/// «ابدأ التجربة» for a fresh start — all computed from the same catalogs +
/// persisted progress as رحلتي (journey_logic.startAction).
class StartScreen extends StatefulWidget {
  const StartScreen({super.key, this.onAskTutor, this.onOpenJourney});

  /// Jumps to the مساعدي tab (wired by the root shell).
  final VoidCallback? onAskTutor;

  /// Jumps to the رحلتي tab.
  final VoidCallback? onOpenJourney;

  @override
  State<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends State<StartScreen> {
  StartAction? _action;
  List<LearnCatalog> _catalogs = const [];
  int _pathDone = 0;
  int _pathReady = 0;
  bool _allDone = false;
  bool _gradeSoon = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    LearnProgressStore.revision.addListener(_onProgressChanged);
  }

  @override
  void dispose() {
    LearnProgressStore.revision.removeListener(_onProgressChanged);
    super.dispose();
  }

  void _onProgressChanged() {
    if (mounted) _load(sync: false);
  }

  Future<void> _load({bool sync = true}) async {
    final catalogs = await LearnCatalogLoader.catalogs(
      language: Session.instance.language,
      grade: Session.instance.grade,
    );
    final store = await LearnProgressStore.load();
    _catalogs = catalogs;
    void recompute() {
      final completed = store.completed;
      final resume = store.resume;
      // No catalogs for this grade = the curriculum is still being authored.
      // That is a different truth than "you finished everything". Same rule
      // when catalogs exist but hold no READY experience yet: an all-"soon"
      // grade earns the honest "being prepared" card, never a false
      // "you completed everything!" celebration.
      final hasReady = catalogs.any((c) => c.paths
          .any((p) => p.experiences.any((e) => e.ready)));
      _gradeSoon = catalogs.isEmpty || !hasReady;
      _action = startAction(
        catalogs,
        completed,
        resumePathId: resume?.pathId,
        resumeExperienceId: resume?.experienceId,
        resumeStep: resume?.step ?? 0,
      );
      _allDone = !_gradeSoon && _action == null;
      if (_action != null) {
        final (done, ready) = pathProgress(_action!.position.path, completed);
        _pathDone = done;
        _pathReady = ready;
      }
    }

    if (mounted) setState(() { recompute(); _loading = false; });
    if (sync && await store.syncWithBackend() && mounted) {
      setState(recompute);
    }
  }

  Future<void> _openAction() async {
    final action = _action;
    if (action == null) return;
    // The owning catalog's subject (null when unresolvable — the tutor
    // context then omits the subject rather than guessing one).
    String? subject;
    for (final c in _catalogs) {
      if (c.paths.any((p) => p.id == action.position.path.id)) {
        subject = c.subject;
        break;
      }
    }
    await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => ExperienceScreen(
          path: action.position.path,
          experience: action.position.experience,
          initialStep: action.step,
          subject: subject,
        ),
      ),
    );
    if (mounted) await _load(sync: false);
  }

  Future<void> _openContextSheet() async {
    final changed = await showContextSheet(context);
    if (changed && mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final lens = Session.instance.learningContext;

    return Scaffold(
      backgroundColor: MiddlePalette.cream,
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 28, 20, 96),
                children: [
                  Text(
                    '${l.translate('start_greeting')} ${Session.instance.name}',
                    style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900, height: 1.3),
                  ),
                  if (!_gradeSoon) ...[
                    const SizedBox(height: 14),
                    // The context lens — a small secondary control, never a tab.
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: ActionChip(
                        avatar: Text(contextEmoji(lens), style: const TextStyle(fontSize: 15)),
                        label: Text(
                          lens == null
                              ? l.translate('ctx_chip_pick')
                              : '${l.translate('ctx_chip_label')}: ${l.translate('ctx_$lens')}',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                        ),
                        onPressed: _openContextSheet,
                      ),
                    ),
                  ],
                  const SizedBox(height: 26),
                  _gradeSoon
                      ? _gradeSoonCard(l, cs)
                      : _allDone
                          ? _allDoneCard(l, cs)
                          : _momentCard(l, cs),
                ],
              ),
      ),
    );
  }

  /// The one learning moment: real next (or resumable) experience, honest CTA.
  Widget _momentCard(AppLocalizations l, ColorScheme cs) {
    final action = _action!;
    final path = action.position.path;
    final experience = action.position.experience;

    final cta = switch (action.kind) {
      StartActionKind.resume => l.translate('start_resume_exp'),
      StartActionKind.exploreNext => l.translate('start_explore_next'),
      StartActionKind.begin => l.translate('start_begin_exp'),
    };

    // Honest position lines: where this experience sits on its path, and —
    // only when truly resumable — the exact step the learner reached.
    final position = l
        .translate('start_exp_position')
        .replaceFirst('{n}', '${_pathDone + 1}')
        .replaceFirst('{m}', '$_pathReady');
    final resumeLine = action.kind == StartActionKind.resume
        ? l
            .translate('start_resume_step')
            .replaceFirst('{n}', '${action.step + 1}')
            .replaceFirst('{m}', '${experience.steps.length}')
        : null;

    return Material(
      color: MiddlePalette.card,
      borderRadius: BorderRadius.circular(Palette.radiusCard),
      child: InkWell(
        borderRadius: BorderRadius.circular(Palette.radiusCard),
        onTap: _openAction,
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            border: Border.all(color: MiddlePalette.outline),
            borderRadius: BorderRadius.circular(Palette.radiusCard),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // "Your learning moment now" is a progress/discovery signal —
              // the fixed orange, not this path's own identity color, so it
              // reads the same regardless of which path is current.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: MiddlePalette.discovery.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  l.translate('start_now_label'),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: MiddlePalette.discovery,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Text(path.emoji, style: const TextStyle(fontSize: 32)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          experience.title,
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, height: 1.4),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          path.title,
                          style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (experience.subtitle.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  experience.subtitle,
                  style: TextStyle(fontSize: 13.5, height: 1.6, color: cs.onSurfaceVariant),
                ),
              ],
              const SizedBox(height: 10),
              Text(
                resumeLine ?? position,
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: _openAction,
                style: FilledButton.styleFrom(
                  backgroundColor: MiddlePalette.primaryAction,
                  minimumSize: const Size(double.infinity, 52),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(Palette.radiusButton),
                  ),
                ),
                icon: const Icon(Icons.play_arrow_rounded),
                label: Text(
                  cta,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Grades whose curriculum is still being authored (8/9 today): the honest
  /// compact state — no dead «ابدأ التجربة» button, one real capability.
  Widget _gradeSoonCard(AppLocalizations l, ColorScheme cs) {
    final gradeWord = l.translate('grade_word_${Session.instance.grade}');
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        border: Border.all(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(Palette.radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('🌱', style: TextStyle(fontSize: 32)),
          const SizedBox(height: 8),
          Text(
            l.translateWith('grade_soon_title', {'g': gradeWord}),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, height: 1.5),
          ),
          const SizedBox(height: 4),
          Text(
            l.translate('grade_soon_body'),
            style: TextStyle(fontSize: 13.5, height: 1.6, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: widget.onAskTutor,
            style: FilledButton.styleFrom(
              minimumSize: const Size(double.infinity, 52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(Palette.radiusButton),
              ),
            ),
            icon: const Icon(Icons.support_agent_rounded),
            label: Text(
              l.translate('start_ask_title'),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }

  /// Every ready experience is completed — point at the map and the tutor.
  Widget _allDoneCard(AppLocalizations l, ColorScheme cs) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        border: Border.all(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(Palette.radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('🌟', style: TextStyle(fontSize: 32)),
          const SizedBox(height: 8),
          Text(
            l.translate('start_all_done_title'),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            l.translate('start_all_done_body'),
            style: TextStyle(fontSize: 13.5, height: 1.6, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: widget.onOpenJourney,
            child: Text(l.translate('start_open_journey')),
          ),
          const SizedBox(height: 4),
          TextButton(
            onPressed: widget.onAskTutor,
            child: Text(l.translate('start_ask_title')),
          ),
        ],
      ),
    );
  }
}
