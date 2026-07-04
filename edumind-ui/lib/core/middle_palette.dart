import 'package:flutter/material.dart';

/// Middle-school (grades 7-9) design tokens — the calm counterpart to the
/// primary product's bright [Palette]. Extends the onboarding OnbColors
/// direction: ivory surfaces, ink-blue structure, muted per-path accents.
/// Used only by the middle learn screens; primary screens never import this.
class MiddlePalette {
  /// Screen background for رحلتي and the path detail.
  static const ivory = Color(0xFFFDFBF6);

  /// Headings and strong text.
  static const blueInk = Color(0xFF14395C);

  /// Body/secondary text.
  static const body = Color(0xFF5B6B7C);

  /// Calm card/selection surfaces.
  static const softBlue = Color(0xFFE9F1F8);

  /// Hairline card outlines.
  static const outline = Color(0xFFDFE3E8);

  /// The 8 curriculum-path accents live in the catalog JSON (each path's
  /// `color`), saturation-matched to read on ivory. Kept as data, not code,
  /// so grade-8/9 catalogs can bring their own without touching the app.
}
