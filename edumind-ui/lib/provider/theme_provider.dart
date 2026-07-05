import 'package:flutter/material.dart';

import '../core/app_theme.dart';

/// Owns the app's single warm theme. Kept as a [ChangeNotifier] so the
/// existing `MultiProvider` wiring in main.dart is unchanged, but there is no
/// longer a swappable "passion" theme — OpenMind has one cohesive visual
/// system. Personalization lives in the learner's accent color (mascot/trail)
/// and the context lens, not in the app chrome.
class ThemeProvider with ChangeNotifier {
  ThemeData get themeData => buildAppTheme();
}
