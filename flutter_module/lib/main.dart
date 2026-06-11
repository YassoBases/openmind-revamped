import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/palette.dart';
import 'core/session.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/onboarding/onboarding_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Session.load();
  runApp(const EduMindApp());
}

class EduMindApp extends StatelessWidget {
  const EduMindApp({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Session.instance;
    final isArabic = session.onboarded && session.language == 'ar';

    final baseTheme = ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: Palette.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: Palette.green,
        brightness: Brightness.dark,
        surface: Palette.dark,
      ),
      useMaterial3: true,
    );

    // Nunito (EN) / Tajawal (AR) via google_fonts; system fallback offline.
    TextTheme textTheme;
    try {
      textTheme = isArabic
          ? GoogleFonts.tajawalTextTheme(baseTheme.textTheme)
          : GoogleFonts.nunitoTextTheme(baseTheme.textTheme);
    } catch (_) {
      textTheme = baseTheme.textTheme;
    }

    return MaterialApp(
      title: 'OpenMind',
      debugShowCheckedModeBanner: false,
      theme: baseTheme.copyWith(textTheme: textTheme),
      locale: isArabic ? const Locale('ar') : const Locale('en'),
      builder: (context, child) => Directionality(
        textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
        child: child ?? const SizedBox.shrink(),
      ),
      home: session.onboarded ? const DashboardScreen() : const OnboardingScreen(),
    );
  }
}
