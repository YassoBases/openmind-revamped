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
  // archetype (palette.dart kInterests).
  static const _interestIdArchetype = {
    'science': 'space', // علوم واختراعات
    'tech': 'robots', // تقنية ومستقبل
    'sport': 'football', // رياضة وحركة
    'art': 'art', // رسم وتصميم
    'stories': 'royalty', // قصص وتاريخ
    'nature': 'ocean', // طبيعة وبيئة
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

    // Elementary game archetypes are a primary-stage concept; middle-school
    // learners pick a context lens later (in-app sheet), never here.
    String? interest;
    if (stageForGrade(grade) == LearningStage.primaryGames) {
      for (final id in prefs.getStringList('user_interests_v2') ?? const []) {
        interest = _interestIdArchetype[id];
        if (interest != null) break;
      }
      if (interest == null) {
        final interests = prefs.getStringList('user_interests') ?? const [];
        if (interests.isNotEmpty) {
          final idx = int.tryParse(interests.first);
          if (idx != null && idx >= 0 && idx < _interestArchetype.length) {
            interest = _interestArchetype[idx];
          }
        }
      }
    }

    final profile = <String, dynamic>{
      'name': name,
      'grade': grade,
      'stage': stageForGrade(grade).wire, // offline fallback; server overwrites
      'language': language,
      'color': colorHex,
      if (interest != null) 'interest': interest,
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
