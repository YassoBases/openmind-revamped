import 'package:flutter/material.dart';

class ThemeProvider with ChangeNotifier {
  // الألوان الافتراضية للتطبيق (شغف العلوم والتكنولوجيا كمثال)
  Color _primaryColor = const Color(0xFF6A1B9A); // البنفسجي الافتراضي لكودك
  Color _accentColor = const Color(0xFFFF9800); // البرتقالي الافتراضي لكودك

  // Getters للوصول للألوان من أي مكان
  Color get primaryColor => _primaryColor;
  Color get accentColor => _accentColor;

  // دالة تحديث الألوان عند اختيار الطالب لشغف جديد
  void updateTheme(Color newPrimary, Color newAccent) {
    _primaryColor = newPrimary;
    _accentColor = newAccent;

    // هذه السطر السحري يقوم بإعادة بناء (Rebuild) كل الواجهات المعتمدة على الألوان فوراً!
    notifyListeners();
  }

  // بناء ThemeData مخصص ديناميكي لربطه بالـ MaterialApp
  ThemeData get themeData {
    return ThemeData(
      primaryColor: _primaryColor,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _primaryColor,
        primary: _primaryColor,
        secondary: _accentColor,
      ),
      // تخصيص خط وتصميم الأزرار بشكل موحد لكل التطبيق
      fontFamily: 'Cairo',
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: _primaryColor,
          foregroundColor: Colors.white,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: _primaryColor,
        foregroundColor: Colors.white,
      ),
    );
  }
}
