import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';
import 'session.dart';

/// Bridges EduMind's onboarding (which stores its own `user_*` prefs) to the
/// OpenMind engine's [Session]/backend account. Called once when the student
/// finishes profile + theme setup: it maps the collected answers to the
/// backend's student schema, registers (for authorized generation), and always
/// saves the profile locally so the app works offline too.
class ProfileBridge {
  // EduMind class labels → elementary grade, clamped to the backend's 1..6.
  static const _classGrade = {'خامس': 5, 'سادس': 6, 'سابع': 6, 'ثامن': 6};

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

    String? interest;
    final interests = prefs.getStringList('user_interests') ?? const [];
    if (interests.isNotEmpty) {
      final idx = int.tryParse(interests.first);
      if (idx != null && idx >= 0 && idx < _interestArchetype.length) {
        interest = _interestArchetype[idx];
      }
    }

    final profile = <String, dynamic>{
      'name': name,
      'grade': grade,
      'language': language,
      'color': colorHex,
      if (interest != null) 'interest': interest,
      'dailyGoal': 3,
    };

    // Register for authorized generation; offline is fine — replay/demo still
    // work, and a new game can register later from the settings screen.
    try {
      final res = await Api.createStudent(profile);
      await Session.instance.setAuth(res['studentId'] as String, res['token'] as String);
    } catch (_) {/* offline — generation needs a server, everything else works */}

    await Session.instance.setProfile(profile);
  }
}
