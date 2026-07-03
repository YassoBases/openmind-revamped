import 'package:edumind/provider/theme_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'onboarding_screen.dart';

// 1. استيراد الملفات الجديدة لإدارة اللغة والترجمة
// (تأكد من تعديل المسارات بناءً على أسماء ملفاتك)
import 'language_provider.dart';
import 'app_localizations.dart';
import 'core/mobile_shell.dart';
import 'core/session.dart';
import 'edumind_root.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The OpenMind AI engine (api_client, player, game store) reads
  // Session.instance everywhere, so the local session must load first.
  await Session.load();
  runApp(
    // استخدام MultiProvider لإدارة الـ Theme والـ Language معاً
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (context) => ThemeProvider()),
        ChangeNotifierProvider(
          // start in the student's saved language (defaults to Arabic)
          create: (context) => LanguageProvider(
            Session.instance.onboarded ? Session.instance.language : 'ar',
          ),
        ),
      ],
      child: const EduMindApp(),
    ),
  );
}

class EduMindApp extends StatelessWidget {
  const EduMindApp({super.key});

  @override
  Widget build(BuildContext context) {
    // استدعاء الـ Providers للاستماع للتغييرات في الثيم واللغة
    final themeProvider = Provider.of<ThemeProvider>(context);
    final languageProvider = Provider.of<LanguageProvider>(context);

    return MaterialApp(
      title: 'EduMind',
      debugShowCheckedModeBanner: false,
      theme: themeProvider.themeData, // الثيم الخاص بك
      // 2. ربط اللغة الحالية المحددة من قبل الطالب بالتطبيق
      locale: languageProvider.currentLocale,

      // 3. إضافة الـ Delegates للترجمة متضمنة الـ AppLocalizations الخاص بك
      localizationsDelegates: [
        AppLocalizations.delegate, // ملف الترجمة الخاص بك لتغيير النصوص برمجياً
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],

      // 4. تحديد اللغات التي يدعمها التطبيق بالكامل
      supportedLocales: const [
        Locale('ar'), // العربية
        Locale('en'), // الإنجليزية
      ],

      // The middle-school product stays a narrow phone-shaped app on wide
      // desktop-web viewports (tabs and pushed routes alike).
      builder: (context, child) => MobileShell(child: child!),

      // Route by profile state: returning students land on the app shell;
      // first-run goes through onboarding (which writes Session.profile).
      home: Session.instance.onboarded
          ? const EduMindRoot()
          : const OnboardingScreen(),
    );
  }
}
