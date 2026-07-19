import 'package:flutter/material.dart';

/// The one warm, Arabic-first design system for OpenMind — carrying the
/// fixed OpenMind brand palette (the same Warm Cream / Main Teal / Deep Teal
/// / Bright Orange system the game shells and `Palette` in core/palette.dart
/// render), so a child moving between the app chrome and a game never feels
/// like they changed products.
///
/// Token NAMES are historical (blueInk/blue predate the teal identity) and
/// kept stable so the ~120 call sites heal by value: `blueInk` is now Deep
/// Teal ink, `blue` is Main Teal, `softBlue` is Soft Sky. Builds the single
/// [ThemeData] every screen inherits; M3 screens that read
/// `Theme.of(context).colorScheme` heal automatically.
///
/// Hierarchy: deep-teal ink = structure & primary action, orange = accent /
/// selection / progress, cream & sand = warm surfaces, soft sky = calm
/// selection surface, muted green/amber = success/warning (never neon,
/// never alarm-red — a wrong answer is a teaching moment, not an error).
class AppColors {
  // Surfaces
  static const ivory = Color(0xFFFDF2E2); // app background — Warm Cream
  static const cream = Color(0xFFFAE9D0); // secondary warm surface — Soft Sand
  static const softBlue = Color(0xFFCEEBF0); // calm selection — Soft Sky Blue
  static const white = Color(0xFFFFFFFF);

  // Ink / text
  static const blueInk = Color(0xFF19725E); // headings, structure — Deep Teal
  static const body = Color(0xFF4E6E64); // secondary text — muted deep teal
  static const outline = Color(0xFFEAD9BF); // hairlines — sand

  // Accents
  static const blue = Color(0xFF079A90); // interactive elements — Main Teal
  static const orange = Color(0xFFEF9722); // action highlight — Bright Orange
  static const orangeSoft = Color(0xFFFADBB0); // orange container — Soft Peach
  static const orangeInk = Color(0xFF8A5210); // on orange container — warm brown

  // Feedback (calm, not Duolingo-neon)
  static const mutedGreen = Color(0xFF4D8C58); // success — Deep Green
  static const mutedGreenSoft = Color(0xFFE6EFDF);
  // Warning / try-again — a muted ochre, deliberately not red: "try again"
  // reads as a nudge, not an alarm. Distinct hue from `orange` (the CTA
  // accent) so the two never get confused in the same view.
  static const mutedAmber = Color(0xFF8A6D1F);
  static const mutedAmberSoft = Color(0xFFF2E8D0);

  // Middle-school (grades 7-9) retry/incorrect feedback — a soft learning
  // yellow, deliberately not red/purple/amber-ochre/orange: a wrong answer is
  // a teaching moment, not an alarm, and orange stays reserved for
  // progress/discovery there. Same three-tier shape as orange/orangeSoft/
  // orangeInk: [retryYellow] borders/icons, [retryYellowSoft] container fill,
  // [retryYellowInk] body text (darkest, for contrast on the soft fill). See
  // core/middle_palette.dart for the rest of that screen family's tokens
  // (this trio lives here too since it's shared by components — like the
  // tutor blocks and chat — that already depend on AppColors).
  static const retryYellow = Color(0xFFE8C978);
  static const retryYellowSoft = Color(0xFFFFF4D6);
  static const retryYellowInk = Color(0xFF7A5A16);
}

/// Corner radii — reconciles the two prior systems (Palette 24/16/20 and
/// onboarding 14/16/28) onto one scale.
class AppRadii {
  static const button = 14.0;
  static const card = 20.0;
  static const input = 16.0;
  static const pill = 999.0;
  static const rail = 28.0;
}

/// Builds the single light theme. [accent] is the learner's personal accent
/// (mascot/trail); it does not repaint surfaces — the warm system is fixed.
ThemeData buildAppTheme() {
  final base = ColorScheme.fromSeed(
    seedColor: AppColors.blueInk,
    brightness: Brightness.light,
  );

  final scheme = base.copyWith(
    primary: AppColors.blueInk,
    onPrimary: AppColors.white,
    primaryContainer: AppColors.softBlue,
    onPrimaryContainer: AppColors.blueInk,
    secondary: AppColors.orange,
    onSecondary: AppColors.white,
    secondaryContainer: AppColors.orangeSoft,
    onSecondaryContainer: AppColors.orangeInk,
    tertiary: AppColors.blue,
    onTertiary: AppColors.white,
    error: AppColors.mutedAmber,
    onError: AppColors.white,
    errorContainer: AppColors.mutedAmberSoft,
    onErrorContainer: AppColors.mutedAmber,
    surface: AppColors.ivory,
    onSurface: AppColors.blueInk,
    onSurfaceVariant: AppColors.body,
    surfaceContainerLowest: AppColors.white,
    surfaceContainerLow: AppColors.ivory,
    surfaceContainer: AppColors.cream,
    surfaceContainerHigh: AppColors.softBlue,
    surfaceContainerHighest: AppColors.softBlue,
    outline: AppColors.outline,
    outlineVariant: const Color(0xFFF0E4CE),
    shadow: const Color(0xFF19725E),
  );

  final buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppRadii.button),
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: scheme,
    fontFamily: 'Cairo',
    scaffoldBackgroundColor: AppColors.ivory,
    canvasColor: AppColors.ivory,
    splashFactory: InkRipple.splashFactory,

    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.ivory,
      foregroundColor: AppColors.blueInk,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),

    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppColors.softBlue,
      elevation: 0,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontFamily: 'Cairo',
          fontSize: 11.5,
          fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
          color: selected ? AppColors.blueInk : AppColors.body,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? AppColors.blueInk : AppColors.body,
        );
      }),
    ),

    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.blueInk,
        foregroundColor: AppColors.white,
        shape: buttonShape,
        textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w800),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.blueInk,
        foregroundColor: AppColors.white,
        shape: buttonShape,
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.blueInk,
        side: const BorderSide(color: AppColors.outline),
        shape: buttonShape,
        textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.blueInk,
        textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w700),
      ),
    ),

    chipTheme: ChipThemeData(
      backgroundColor: AppColors.softBlue,
      labelStyle: const TextStyle(
        fontFamily: 'Cairo',
        fontWeight: FontWeight.w700,
        color: AppColors.blueInk,
      ),
      side: BorderSide.none,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      surfaceTintColor: Colors.transparent,
    ),

    cardTheme: CardThemeData(
      color: AppColors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
    ),

    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.softBlue,
      hintStyle: const TextStyle(color: AppColors.body),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.input),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.input),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.input),
        borderSide: const BorderSide(color: AppColors.blue, width: 1.6),
      ),
    ),

    sliderTheme: const SliderThemeData(
      activeTrackColor: AppColors.blue,
      thumbColor: AppColors.blue,
      inactiveTrackColor: AppColors.softBlue,
    ),

    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AppColors.blue,
      linearTrackColor: AppColors.softBlue,
      circularTrackColor: AppColors.softBlue,
    ),

    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.ivory,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),

    dividerTheme: const DividerThemeData(color: AppColors.outline, thickness: 1),
  );
}
