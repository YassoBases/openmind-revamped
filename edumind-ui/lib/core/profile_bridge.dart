import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';
import 'session.dart';
import 'stage.dart';

/// Bridges EduMind's onboarding (which stores its own `user_*` prefs) to the
/// OpenMind engine's [Session]/backend account. Called once when the student
/// finishes profile + theme setup: it maps the collected answers to the
/// backend's student schema, registers (for authorized generation), and always
/// saves the profile locally so the app works offline too.
class ProfileBridge {
  // Legacy EduMind class labels → true grade — kept so profiles saved by the
  // old setup form still resolve. The redesigned onboarding writes the real
  // grade (1-9) to `user_grade` directly. Grade 7+ stays 7+ end-to-end — the
  // stage resolver (core/stage.dart) decides the product mode from it; only
  // the elementary game-generation boundary ever clamps (server-side).
  static const _classGrade = {'خامس': 5, 'سادس': 6, 'سابع': 7, 'ثامن': 8};

  // Redesigned onboarding interest ids (`user_interests_v2`) → companion
  // archetype (palette.dart kInterests) — primary-stage game shells only.
  static const _interestIdArchetype = {
    'tech_robotics': 'robots', // تكنولوجيا وروبوتات
    'games_challenges': 'cars', // ألعاب وتحديات
    'drawing_design': 'art', // رسم وتصميم
    'sports_movement': 'football', // رياضة وحركة
    'reading_stories': 'royalty', // قراءة وقصص
    'helping_people': 'cats', // مساعدة الناس
    'nature_environment': 'ocean', // طبيعة وبيئة
  };

  // Legacy interest index (old profilesetup order) → companion archetype.
  static const _interestArchetype = [
    'robots', // ألعاب وتحديات
    'football', // رياضة وحركة
    'art', // رسم وتصميم
    'space', // علوم وتكنولوجيا
    'cars', // بناء وعمارة
    'ocean', // طبيعة وطاقة
    'royalty', // مساعدة الناس
    'robots', // ألغاز وتفكير
    'music', // قراءة وقصص
  ];

  /// [colorHex] is the chosen theme accent (e.g. '#FF9800'); [language] is the
  /// current app language code ('en'/'ar').
  static Future<void> finishSetup({required String colorHex, required String language}) async {
    final prefs = await SharedPreferences.getInstance();

    var name = (prefs.getString('user_name') ?? '').trim();
    if (name.isEmpty) name = 'Player';
    if (name.length > 24) name = name.substring(0, 24);

    final grade = prefs.getInt('user_grade') ??
        _classGrade[prefs.getString('user_class')] ??
        5;
    final gender = prefs.getString('user_gender');

    // Personal interests (1-2, both stages) — the primary AI-flavor signal.
    // See OnboardingFlow._interestsStep.
    final interests = prefs.getStringList('user_interests_v2') ?? const [];

    // Elementary companion-sprite archetype — a primary-stage-only concept,
    // derived from the first selected interest so the game shells' companion
    // keeps working unchanged.
    String? interest;
    if (stageForGrade(grade) == LearningStage.primaryGames) {
      for (final id in interests) {
        interest = _interestIdArchetype[id];
        if (interest != null) break;
      }
      if (interest == null) {
        final legacy = prefs.getStringList('user_interests') ?? const [];
        if (legacy.isNotEmpty) {
          final idx = int.tryParse(legacy.first);
          if (idx != null && idx >= 0 && idx < _interestArchetype.length) {
            interest = _interestArchetype[idx];
          }
        }
      }
    }

    final profile = <String, dynamic>{
      'name': name,
      if (gender != null) 'gender': gender,
      'grade': grade,
      'stage': stageForGrade(grade).wire, // offline fallback; server overwrites
      'language': language,
      'color': colorHex,
      if (interest != null) 'interest': interest,
      if (interests.isNotEmpty) 'interests': interests,
      'dailyGoal': 3,
    };

    // Save first so the app works offline, then register; the backend's
    // student view (trusted grade/stage) overwrites the local guess.
    await Session.instance.setProfile(profile);
    try {
      final res = await Api.createStudent(profile);
      await Session.instance.setAuth(res['studentId'] as String, res['token'] as String);
      final student = res['student'];
      if (student is Map<String, dynamic>) {
        await Session.instance.applyStudentView(student);
      }
    } catch (_) {/* offline — generation needs a server, everything else works */}
  }
}
