import 'package:flutter/material.dart';
import 'core/session.dart';

class LanguageProvider extends ChangeNotifier {
  // Default is Arabic (RTL-first); a returning student's saved language is
  // passed in from main() so the app and the AI generator stay in sync.
  LanguageProvider([String initialLanguageCode = 'ar'])
      : _currentLocale = Locale(initialLanguageCode);

  Locale _currentLocale;

  Locale get currentLocale => _currentLocale;

  // دالة لتغيير اللغة وتحديث الواجهات فوراً
  void changeLanguage(String languageCode) {
    if (_currentLocale.languageCode == languageCode) return;
    _currentLocale = Locale(languageCode);
    notifyListeners(); // إشعار التطبيق بالكامل بالتحديث
    // Persist into the saved profile so it survives restarts and the AI
    // generator produces content in the chosen language.
    try {
      if (Session.instance.onboarded) {
        final p = Map<String, dynamic>.from(Session.instance.profile ?? {});
        p['language'] = languageCode;
        Session.instance.setProfile(p);
      }
    } catch (_) {/* session not ready — ignore */}
  }
}
