import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../widgets/candy_button.dart';
import '../../widgets/mascot.dart';
import '../dashboard/dashboard_screen.dart';
import '../settings/settings_screen.dart';

/// Mascot-guided onboarding: name → grade (+optional gender) → language →
/// color → interest → daily goal → register. Nickname only — never a real
/// name or email (minors).
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _page = PageController();
  int _step = 0;
  final _name = TextEditingController();
  int _grade = 3;
  String? _gender;
  String _language = 'en';
  Color _color = kColorChoices.first;
  String? _interest;
  int _dailyGoal = 3;
  bool _busy = false;

  static const _steps = 6;

  void _next() {
    if (_step < _steps - 1) {
      setState(() => _step++);
      _page.animateToPage(_step,
          duration: const Duration(milliseconds: 320), curve: Curves.easeOutCubic);
    } else {
      _register();
    }
  }

  Future<void> _register() async {
    setState(() => _busy = true);
    final profile = {
      'name': _name.text.trim().isEmpty ? 'Player' : _name.text.trim(),
      'gender': _gender,
      'grade': _grade,
      'language': _language,
      'color': colorToHex(_color),
      'interest': _interest,
      'dailyGoal': _dailyGoal,
    };
    try {
      final res = await Api.createStudent(profile);
      await Session.instance.setAuth(res['studentId'] as String, res['token'] as String);
      await Session.instance.setProfile(res['student'] as Map<String, dynamic>);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const DashboardScreen()));
    } catch (_) {
      setState(() => _busy = false);
      if (!mounted) return;
      // Server unreachable — offer settings or offline (demos-only) mode.
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: Palette.card,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Palette.radiusCard)),
          title: Text(trLang(_language, 'connectionFail'),
              style: const TextStyle(color: Palette.soft)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            CandyButton(
              label: trLang(_language, 'connectServer'),
              color: Palette.blue,
              onTap: () {
                Navigator.pop(ctx);
                Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const SettingsScreen()));
              },
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: () async {
                await Session.instance.setProfile(profile);
                if (ctx.mounted) Navigator.pop(ctx);
                if (!mounted) return;
                Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => const DashboardScreen()));
              },
              child: Text(trLang(_language, 'continueOffline'),
                  style: const TextStyle(color: Palette.grey)),
            ),
          ]),
        ),
      );
    }
  }

  Widget _stepCard({
    required String title,
    required Widget body,
    MascotExpression mood = MascotExpression.happy,
    MascotCharacter character = MascotCharacter.hoopoe,
  }) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(children: [
        const Spacer(),
        Mascot(size: 130, accent: _color, expression: mood, character: character),
        const SizedBox(height: 18),
        Text(title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: Palette.soft)),
        const SizedBox(height: 24),
        body,
        const Spacer(flex: 2),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = _language;
    final pages = <Widget>[
      _stepCard(
        title: trLang(lang, 'welcome1'),
        body: TextField(
          controller: _name,
          maxLength: 24,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Palette.soft, fontSize: 20, fontWeight: FontWeight.w700),
          decoration: InputDecoration(
            hintText: trLang(lang, 'nickname'),
            counterText: '',
            filled: true,
            fillColor: Palette.card,
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(Palette.radiusInput),
                borderSide: BorderSide.none),
          ),
        ),
      ),
      _stepCard(
        title: trLang(lang, 'gradeQ'),
        body: Column(children: [
          Wrap(
            spacing: 10, runSpacing: 10, alignment: WrapAlignment.center,
            children: [for (var g = 1; g <= 6; g++) _chip('${trLang(lang, 'grade')} $g', _grade == g, () => setState(() => _grade = g))],
          ),
          const SizedBox(height: 22),
          Text(trLang(lang, 'genderQ'), style: const TextStyle(color: Palette.grey, fontSize: 14)),
          const SizedBox(height: 8),
          Wrap(spacing: 10, alignment: WrapAlignment.center, children: [
            _chip(trLang(lang, 'genderM'), _gender == 'm', () => setState(() => _gender = 'm')),
            _chip(trLang(lang, 'genderF'), _gender == 'f', () => setState(() => _gender = 'f')),
            _chip(trLang(lang, 'genderSkip'), _gender == null, () => setState(() => _gender = null)),
          ]),
        ]),
      ),
      _stepCard(
        title: trLang(lang, 'languageQ'),
        body: Wrap(spacing: 12, alignment: WrapAlignment.center, children: [
          _chip('English 🇬🇧', _language == 'en', () => setState(() => _language = 'en')),
          _chip('العربية 🇸🇦', _language == 'ar', () => setState(() => _language = 'ar')),
        ]),
      ),
      _stepCard(
        title: trLang(lang, 'colorQ'),
        body: Wrap(
          spacing: 14, runSpacing: 14, alignment: WrapAlignment.center,
          children: [
            for (final c in kColorChoices)
              GestureDetector(
                onTap: () => setState(() => _color = c),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: 52, height: 52,
                  decoration: BoxDecoration(
                    color: c,
                    shape: BoxShape.circle,
                    border: Border.all(
                        color: _color == c ? Colors.white : Colors.transparent, width: 4),
                  ),
                  child: _color == c
                      ? const Icon(Icons.check_rounded, color: Colors.white)
                      : null,
                ),
              ),
          ],
        ),
      ),
      _stepCard(
        title: trLang(lang, 'interestQ'),
        body: Wrap(
          spacing: 10, runSpacing: 10, alignment: WrapAlignment.center,
          children: [
            for (final i in kInterests)
              _chip('${kInterestEmoji[i]} $i', _interest == i,
                  () => setState(() => _interest = _interest == i ? null : i)),
          ],
        ),
      ),
      _stepCard(
        title: trLang(lang, 'goalQ'),
        mood: MascotExpression.celebrating,
        character: MascotCharacter.bee, // goals & rewards are Nahla's domain
        body: Wrap(spacing: 12, alignment: WrapAlignment.center, children: [
          for (final g in [1, 3, 5]) _chip('$g 🎮', _dailyGoal == g, () => setState(() => _dailyGoal = g)),
        ]),
      ),
    ];

    return Directionality(
      textDirection: lang == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        backgroundColor: Palette.dark,
        body: SafeArea(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: (_step + 1) / _steps,
                  minHeight: 10,
                  backgroundColor: Palette.card,
                  valueColor: AlwaysStoppedAnimation(_color),
                ),
              ),
            ),
            Expanded(
              child: PageView(
                controller: _page,
                physics: const NeverScrollableScrollPhysics(),
                children: pages,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
              child: Row(children: [
                if (_step > 0)
                  TextButton(
                    onPressed: () {
                      setState(() => _step--);
                      _page.animateToPage(_step,
                          duration: const Duration(milliseconds: 280), curve: Curves.easeOutCubic);
                    },
                    child: Text(trLang(lang, 'back'), style: const TextStyle(color: Palette.grey)),
                  ),
                const Spacer(),
                SizedBox(
                  width: 220,
                  child: CandyButton(
                    label: _busy
                        ? '…'
                        : _step == _steps - 1
                            ? trLang(lang, 'startAdventure')
                            : trLang(lang, 'next'),
                    color: _color,
                    enabled: !_busy,
                    fontSize: 15,
                    onTap: _next,
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? _color.withValues(alpha: 0.22) : Palette.card,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: selected ? _color : Palette.cardBorder, width: 2),
        ),
        child: Text(label,
            style: TextStyle(
                color: selected ? Palette.soft : Palette.grey,
                fontWeight: FontWeight.w700)),
      ),
    );
  }
}
