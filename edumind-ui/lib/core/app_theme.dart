import 'package:flutter/material.dart';

/// The one warm, Arabic-first design system for OpenMind.
///
/// Generalizes the onboarding palette (formerly `OnbColors`) and the
/// middle-school palette (`MiddlePalette`) — which were the same calm system
/// implemented twice — into a single token set, and builds the single
/// [ThemeData] every screen inherits. M3 screens that read
/// `Theme.of(context).colorScheme` heal automatically once this is applied.
///
/// Hierarchy: ink-blue = structure & primary action, orange = accent /
/// selection / progress, ivory & cream = warm surfaces, soft blue = calm
/// selection surface, muted green/red = success/error (never neon).
class AppColors {
  // Surfaces
  static const ivory = Color(0xFFFDFBF6); // app background
  static const cream = Color(0xFFF3EBDC); // secondary warm surface / surround
  static const softBlue = Color(0xFFE9F1F8); // calm selection / fills
  static const white = Color(0xFFFFFFFF);

  // Ink / text
  static const blueInk = Color(0xFF14395C); // headings, primary structure
  static const body = Color(0xFF5B6B7C); // secondary text
  static const outline = Color(0xFFDFE3E8); // hairlines

  // Accents
  static const blue = Color(0xFF1C4E80); // interactive structure / links
  static const orange = Color(0xFFE8872E); // action highlight / progress
  static const orangeSoft = Color(0xFFFBE7D4); // orange container
  static const orangeInk = Color(0xFF8A4A16); // on orange container

  // Feedback (calm, not Duolingo-neon)
  static const mutedGreen = Color(0xFF3E7C59); // success
  static const mutedGreenSoft = Color(0xFFE1EDE6);
  static const mutedRed = Color(0xFF9E4B47); // error
  static const mutedRedSoft = Color(0xFFF3E1E0);
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
    error: AppColors.mutedRed,
    onError: AppColors.white,
    errorContainer: AppColors.mutedRedSoft,
    onErrorContainer: AppColors.mutedRed,
    surface: AppColors.ivory,
    onSurface: AppColors.blueInk,
    onSurfaceVariant: AppColors.body,
    surfaceContainerLowest: AppColors.white,
    surfaceContainerLow: AppColors.ivory,
    surfaceContainer: AppColors.cream,
    surfaceContainerHigh: AppColors.softBlue,
    surfaceContainerHighest: AppColors.softBlue,
    outline: AppColors.outline,
    outlineVariant: const Color(0xFFE7EAEE),
    shadow: const Color(0xFF14395C),
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
