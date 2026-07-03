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
  // EduMind class labels → true grade. Grade 7+ stays 7+ end-to-end — the
  // stage resolver (core/stage.dart) decides the product mode from it; only
  // the elementary game-generation boundary ever clamps (server-side).
  static const _classGrade = {'خامس': 5, 'سادس': 6, 'سابع': 7, 'ثامن': 8};

  // EduMind interest index (profilesetup order) → companion archetype.
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

    final grade = _classGrade[prefs.getString('user_class')] ?? 5;

    // Elementary game archetypes are a primary-stage concept; middle-school
    // learners pick a context lens later (in-app sheet), never here.
    String? interest;
    if (stageForGrade(grade) == LearningStage.primaryGames) {
      final interests = prefs.getStringList('user_interests') ?? const [];
      if (interests.isNotEmpty) {
        final idx = int.tryParse(interests.first);
        if (idx != null && idx >= 0 && idx < _interestArchetype.length) {
          interest = _interestArchetype[idx];
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
