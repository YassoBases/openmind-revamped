import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app_localizations.dart';
import '../../core/palette.dart';
import '../../core/profile_bridge.dart';
import '../../core/stage.dart';
import '../../edumind_root.dart';
import '../../language_provider.dart';
import '../../widgets/mascot.dart';
import 'onboarding_widgets.dart';

/// First-run learner onboarding — seven short screens, one primary action
/// each: welcome → name → gender → stage & grade → interests → accent color
/// → starting preference. Replaces the old long scrollable setup form.
///
/// Completion writes the same `user_*` prefs the app has always used and
/// hands off to [ProfileBridge.finishSetup], so Session.profile, backend
/// registration and stage/grade routing all keep their existing paths:
/// grades 1-6 land in the primary experience, 7-9 in the middle-school one
/// (resolved by EduMindRoot via core/stage.dart — never re-derived here).
class OnboardingFlow extends StatefulWidget {
  const OnboardingFlow({super.key, this.onDone});

  /// Test hook: replaces the default pushReplacement into [EduMindRoot].
  final VoidCallback? onDone;

  @override
  State<OnboardingFlow> createState() => _OnboardingFlowState();
}

/// The seven interests (stable ids — ProfileBridge maps the first pick to a
/// companion archetype for the primary-stage game shells). Shown for BOTH
/// stages — the source AI explanations, examples and activities draw from.
const kOnbInterests = [
  (id: 'tech_robotics', icon: Icons.smart_toy_outlined, key: 'onb_int_tech_robotics'),
  (id: 'games_challenges', icon: Icons.sports_esports_outlined, key: 'onb_int_games_challenges'),
  (id: 'drawing_design', icon: Icons.palette_outlined, key: 'onb_int_drawing_design'),
  (id: 'sports_movement', icon: Icons.sports_soccer_outlined, key: 'onb_int_sports_movement'),
  (id: 'reading_stories', icon: Icons.auto_stories_outlined, key: 'onb_int_reading_stories'),
  (id: 'helping_people', icon: Icons.volunteer_activism_outlined, key: 'onb_int_helping_people'),
  (id: 'nature_environment', icon: Icons.eco_outlined, key: 'onb_int_nature_environment'),
];

/// Personal accent choices — exactly the four approved OpenMind accent
/// tokens (palette.dart kColorChoices). Default (blue) first. This accent
/// only ever touches small elements (selected cards, chips, progress
/// details) — never the brand's main visual identity.
final kOnbAccents = [
  (color: kColorChoices[1], key: 'onb_color_blue'), // 1CB0F6
  (color: kColorChoices[0], key: 'onb_color_green'), // 58CC02
  (color: kColorChoices[6], key: 'onb_color_pink'), // FF8FB3
  (color: kColorChoices[8], key: 'onb_color_black'), // 1C1C1E
];

class _OnboardingFlowState extends State<OnboardingFlow> {
  int _step = 0;
  final _name = TextEditingController();

  /// 'm' or 'f' — used ONLY for Arabic grammatical addressing downstream
  /// (the game shells' gendered strings). Never affects tone, content, or
  /// implies anything about the student.
  String? _gender;
  LearningStage? _stageChoice;
  int? _grade;

  /// Personal interests (1-2, both stages) — the primary signal AI
  /// explanations, examples and activities draw from.
  final Set<String> _interests = {};
  int? _style;
  int _accent = 0; // sensible default so the learner is never blocked
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _canAdvance => switch (_step) {
    1 => _name.text.trim().isNotEmpty,
    2 => _gender != null,
    3 => _grade != null,
    4 => _interests.isNotEmpty,
    6 => _style != null,
    _ => true,
  };

  void _next() {
    if (!_canAdvance) return;
    if (_step == 6) {
      _finish();
    } else {
      setState(() => _step++);
    }
  }

  void _back() {
    if (_step > 0 && !_saving) setState(() => _step--);
  }

  /// Persist through the existing profile/preference pipeline: the `user_*`
  /// prefs feed ProfileBridge.finishSetup, which writes Session.profile
  /// (grade + resolved stage — the real routing fields) and registers with
  /// the backend when reachable. A short celebratory beat plays meanwhile.
  Future<void> _finish() async {
    setState(() => _saving = true);
    final lang = Provider.of<LanguageProvider>(
      context,
      listen: false,
    ).currentLocale.languageCode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_name', _name.text.trim());
    if (_gender != null) await prefs.setString('user_gender', _gender!);
    await prefs.setInt('user_grade', _grade!);
    await prefs.setStringList('user_interests_v2', _interests.toList());
    if (_style != null) await prefs.setInt('user_learning_style', _style!);
    await Future.wait([
      ProfileBridge.finishSetup(
        colorHex: colorToHex(kOnbAccents[_accent].color),
        language: lang,
      ),
      Future<void>.delayed(const Duration(milliseconds: 1300)),
    ]);
    if (!mounted) return;
    if (widget.onDone != null) {
      widget.onDone!();
      return;
    }
    Navigator.of(context).pushReplacement<void, void>(
      MaterialPageRoute(builder: (_) => const EduMindRoot()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final stepLabel = l.translateWith('onb_step_of', {
      'n': '${_step + 1}',
      'm': '7',
    });
    return OnbRail(
      child: Scaffold(
        backgroundColor: OnbColors.ivory,
        body: _saving
            ? _CompletionView(
                name: _name.text.trim(),
                accent: kOnbAccents[_accent].color,
              )
            : _step == 0
            ? _WelcomeStep(onStart: _next)
            : SafeArea(
                child: Column(
                  children: [
                    // Quiet orientation header: small back control, a
                    // compact «الخطوة n من 7» label, seven step dots.
                    Padding(
                      padding: const EdgeInsetsDirectional.fromSTEB(
                        10,
                        8,
                        20,
                        0,
                      ),
                      child: Row(
                        children: [
                          IconButton(
                            onPressed: _back,
                            // BackButtonIcon (not a raw Icons.arrow_back) so
                            // the glyph mirrors correctly in RTL — Arabic is
                            // this product's primary language.
                            icon: const BackButtonIcon(),
                            iconSize: 20,
                            color: OnbColors.blue,
                            tooltip: l.translate('onb_back'),
                            visualDensity: VisualDensity.compact,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            stepLabel,
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: OnbColors.body,
                            ),
                          ),
                          const Spacer(),
                          OnbStepDots(
                            current: _step,
                            total: 7,
                            semanticLabel: stepLabel,
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        child: KeyedSubtree(
                          key: ValueKey(_step),
                          child: switch (_step) {
                            1 => _nameStep(l),
                            2 => _genderStep(l),
                            3 => _stageStep(l),
                            4 => _interestsStep(l),
                            5 => _colorStep(l),
                            _ => _styleStep(l),
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  /// Shared step layout: scrollable content + always-visible CTA. The
  /// Scaffold resizes for the keyboard, so the CTA never hides behind it.
  /// Title + choices + CTA only — no explanatory subtitle (declutter).
  Widget _stepShell(
    AppLocalizations l, {
    required String titleKey,
    required Widget child,
    String ctaKey = 'onb_next',
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 14),
                  Text(
                    l.translate(titleKey),
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: OnbColors.blueInk,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 20),
                  child,
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          OnbPrimaryButton(
            label: l.translate(ctaKey),
            onPressed: _canAdvance ? _next : null,
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------ screen 2
  Widget _nameStep(AppLocalizations l) {
    return _stepShell(
      l,
      titleKey: 'onb_name_title',
      child: TextField(
        controller: _name,
        maxLength: 24,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _next(),
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: OnbColors.blueInk,
        ),
        cursorColor: OnbColors.blue,
        decoration: InputDecoration(
          counterText: '',
          hintText: l.translate('onb_name_hint'),
          hintStyle: const TextStyle(
            color: OnbColors.body,
            fontWeight: FontWeight.w500,
          ),
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 16,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: OnbColors.outline, width: 1.2),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: OnbColors.blue, width: 1.8),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------ screen 3
  /// Used ONLY for Arabic grammatical addressing downstream (the game
  /// shells' gendered strings) — never for tone, content, or stereotyping.
  Widget _genderStep(AppLocalizations l) {
    return _stepShell(
      l,
      titleKey: 'onb_gender_title',
      child: Row(
        children: [
          Expanded(child: _genderCard(l, 'm', 'onb_gender_m', Icons.male_rounded)),
          const SizedBox(width: 12),
          Expanded(child: _genderCard(l, 'f', 'onb_gender_f', Icons.female_rounded)),
        ],
      ),
    );
  }

  Widget _genderCard(AppLocalizations l, String value, String key, IconData icon) {
    final selected = _gender == value;
    return OnbSelectCard(
      selected: selected,
      onTap: () => setState(() => _gender = value),
      semanticLabel: l.translate(key),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: selected ? Colors.white : OnbColors.softBlue,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 22, color: OnbColors.blue),
          ),
          const SizedBox(height: 9),
          Text(
            l.translate(key),
            style: TextStyle(
              fontSize: 15.5,
              fontWeight: FontWeight.w700,
              color: selected ? OnbColors.blue : OnbColors.blueInk,
            ),
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------ screen 4
  Widget _stageStep(AppLocalizations l) {
    final grades = switch (_stageChoice) {
      LearningStage.primaryGames => const [1, 2, 3, 4, 5, 6],
      LearningStage.middleInteractiveLearning => const [7, 8, 9],
      null => const <int>[],
    };
    return _stepShell(
      l,
      titleKey: 'onb_stage_title',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: _stageCard(
                  l,
                  LearningStage.primaryGames,
                  'onb_stage_primary',
                  Icons.menu_book_outlined,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _stageCard(
                  l,
                  LearningStage.middleInteractiveLearning,
                  'onb_stage_middle',
                  Icons.school_outlined,
                ),
              ),
            ],
          ),
          // Only the chosen stage's grades appear — never all nine at once.
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: grades.isEmpty
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(top: 20),
                    child: GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 3,
                      childAspectRatio: 2.05,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      children: [
                        for (final g in grades)
                          OnbSelectCard(
                            selected: _grade == g,
                            onTap: () => setState(() => _grade = g),
                            semanticLabel: l.translateWith('onb_grade_sem', {
                              'g': '$g',
                            }),
                            child: Text(
                              l.translate('onb_g$g'),
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: _grade == g
                                    ? OnbColors.blue
                                    : OnbColors.blueInk,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _stageCard(
    AppLocalizations l,
    LearningStage stage,
    String key,
    IconData icon,
  ) {
    final selected = _stageChoice == stage;
    return OnbSelectCard(
      selected: selected,
      onTap: () => setState(() {
        _stageChoice = stage;
        // a grade from the other stage can't survive a stage switch
        if (_grade != null && stageForGrade(_grade!) != stage) _grade = null;
      }),
      semanticLabel: l.translate(key),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: selected ? Colors.white : OnbColors.softBlue,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 22, color: OnbColors.blue),
          ),
          const SizedBox(height: 9),
          Text(
            l.translate(key),
            style: TextStyle(
              fontSize: 15.5,
              fontWeight: FontWeight.w700,
              color: selected ? OnbColors.blue : OnbColors.blueInk,
            ),
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------ screen 5
  /// Shown for BOTH stages — the same personal interests drive AI
  /// explanations, examples and activities regardless of grade.
  Widget _interestsStep(AppLocalizations l) {
    return _stepShell(
      l,
      titleKey: 'onb_interests_title',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            childAspectRatio: 2.85,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            children: [
              for (final it in kOnbInterests)
                OnbSelectCard(
                  selected: _interests.contains(it.id),
                  onTap: () => setState(() {
                    if (_interests.contains(it.id)) {
                      _interests.remove(it.id);
                    } else if (_interests.length < 2) {
                      _interests.add(it.id);
                    }
                  }),
                  semanticLabel: l.translate(it.key),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(it.icon, size: 20, color: OnbColors.blue),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          l.translate(it.key),
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: _interests.contains(it.id)
                                ? OnbColors.blue
                                : OnbColors.blueInk,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          // subtle counter — shown only mid-selection, when it helps
          AnimatedOpacity(
            duration: const Duration(milliseconds: 180),
            opacity: _interests.length == 1 ? 1 : 0,
            child: Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                l.translateWith('onb_count_of', {'n': '${_interests.length}'}),
                style: const TextStyle(fontSize: 12.5, color: OnbColors.body),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------ screen 6
  Widget _colorStep(AppLocalizations l) {
    return _stepShell(
      l,
      titleKey: 'onb_accent_title',
      child: Center(
        child: Wrap(
          spacing: 22,
          runSpacing: 18,
          alignment: WrapAlignment.center,
          children: [
            for (var i = 0; i < kOnbAccents.length; i++) _accentCircle(l, i),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------------ screen 7
  Widget _styleStep(AppLocalizations l) {
    // The third option adapts to the learner's stage; this is a STARTING
    // preference only, never a fixed learning style.
    final middle = _stageChoice == LearningStage.middleInteractiveLearning;
    final styles = [
      (key: 'onb_style_step', icon: Icons.format_list_numbered_rounded),
      (key: 'onb_style_try', icon: Icons.touch_app_outlined),
      middle
          ? (key: 'onb_style_real', icon: Icons.storefront_outlined)
          : (key: 'onb_style_story', icon: Icons.menu_book_outlined),
    ];
    return _stepShell(
      l,
      titleKey: 'onb_style_title',
      ctaKey: 'onb_finish_cta',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < styles.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: OnbSelectCard(
                selected: _style == i,
                onTap: () => setState(() => _style = i),
                semanticLabel: l.translate(styles[i].key),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: _style == i ? Colors.white : OnbColors.softBlue,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        styles[i].icon,
                        size: 19,
                        color: OnbColors.blue,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        l.translate(styles[i].key),
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
                          color: _style == i
                              ? OnbColors.blue
                              : OnbColors.blueInk,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Color circles only — no written names; the name lives in the semantic
  /// label for screen readers. The accent is a small personal touch (borders,
  /// highlights, progress details) and never replaces the brand colors.
  Widget _accentCircle(AppLocalizations l, int i) {
    final selected = _accent == i;
    final color = kOnbAccents[i].color;
    return Semantics(
      label: l.translate(kOnbAccents[i].key),
      button: true,
      selected: selected,
      child: InkWell(
        onTap: () => setState(() => _accent = i),
        customBorder: const CircleBorder(),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          width: 46,
          height: 46,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: selected ? color : Colors.transparent,
              width: 2.4,
            ),
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            child: selected
                ? const Icon(Icons.check_rounded, size: 20, color: Colors.white)
                : null,
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- screen 1
class _WelcomeStep extends StatelessWidget {
  const _WelcomeStep({required this.onStart});

  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Stack(
      children: [
        const Positioned.fill(
          child: CustomPaint(painter: WelcomePatternPainter()),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 18),
            child: LayoutBuilder(
              builder: (context, constraints) {
                // The arch scales with the viewport so short screens (and the
                // keyboard-less 320x568 case) never overflow.
                final archH = (constraints.maxHeight * 0.40).clamp(
                  150.0,
                  265.0,
                );
                final archW = archH * (250 / 265);
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: AlignmentDirectional.centerEnd,
                      child: _LanguagePill(),
                    ),
                    const Spacer(flex: 5),
                    // Hudhud framed by the arch — always composed together.
                    Center(
                      child: ArchHalo(
                        width: archW,
                        height: archH,
                        child: Mascot(
                          size: archH * 0.62,
                          expression: MascotExpression.happy,
                        ),
                      ),
                    ),
                    const SizedBox(height: 22),
                    Text(
                      l.translate('onb_title'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: OnbColors.blueInk,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      l.translate('onb_subtitle'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 15.5,
                        color: OnbColors.body,
                        height: 1.65,
                      ),
                    ),
                    const Spacer(flex: 6),
                    OnbPrimaryButton(
                      label: l.translate('onb_cta'),
                      onPressed: onStart,
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

/// Tiny language toggle — Arabic-first, but English is one tap away.
class _LanguagePill extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final lp = Provider.of<LanguageProvider>(context);
    final isAr = lp.currentLocale.languageCode == 'ar';
    Widget chip(String label, bool active, VoidCallback onTap) => InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: active ? OnbColors.blue : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w800,
            color: active ? Colors.white : OnbColors.body,
          ),
        ),
      ),
    );
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: OnbColors.outline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          chip('العربية', isAr, () => lp.changeLanguage('ar')),
          chip('En', !isAr, () => lp.changeLanguage('en')),
        ],
      ),
    );
  }
}

/// Lightweight completion beat while the profile persists: Hudhud celebrates
/// in the learner's chosen accent, then the flow routes to the real
/// stage-appropriate experience.
class _CompletionView extends StatelessWidget {
  const _CompletionView({required this.name, required this.accent});

  final String name;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return SafeArea(
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ArchHalo(
              child: Mascot(
                size: 158,
                expression: MascotExpression.celebrating,
                accent: accent,
              ),
            ),
            const SizedBox(height: 22),
            Text(
              l.translateWith('onb_done_hi', {'name': name}),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 25,
                fontWeight: FontWeight.w800,
                color: OnbColors.blueInk,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              l.translate('onb_done_sub'),
              style: const TextStyle(fontSize: 15, color: OnbColors.body),
            ),
          ],
        ),
      ),
    );
  }
}
