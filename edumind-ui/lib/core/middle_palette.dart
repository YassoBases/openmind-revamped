import 'package:flutter/material.dart';

/// Middle-school (grades 7-9) design tokens — the calm counterpart to the
/// primary product's bright [Palette]. Extends the onboarding OnbColors
/// direction: warm cream surfaces, ink-blue structure, muted per-path accents.
/// Used only by the middle learn screens; primary screens never import this.
///
/// Color roles (deliberately narrow — each hue means one thing):
///  - [primaryAction] — the one thing to tap next (buttons only).
///  - [discovery] — progress, "what's next", exploration (never an action).
///  - [success] — a correct/complete outcome, never anything else.
///  - [retryYellow] / [retryYellowSoft] / [retryYellowInk] — a wrong or retry
///    state: a soft learning yellow, never an alarm color (no
///    red/purple/amber/orange).
class MiddlePalette {
  /// Screen background for رحلتي and the path detail.
  static const cream = Color(0xFFF6F0E4);

  /// Warm white card/surface — one step lighter than [cream] so cards read as
  /// raised without a hard white/grey break.
  static const card = Color(0xFFFFFCF7);

  /// Headings and strong text.
  static const blueInk = Color(0xFF14395C);

  /// Body/secondary text.
  static const body = Color(0xFF5B6B7C);

  /// Calm card/selection surfaces.
  static const softBlue = Color(0xFFE9F1F8);

  /// Hairline card outlines.
  static const outline = Color(0xFFDFE3E8);

  /// Primary action buttons (continue/finish/start) — the one clear next tap.
  static const primaryAction = Color(0xFF1C4E80);

  /// Progress and discovery: step/ready bars, next-goal chips, exploration
  /// badges. Never used for buttons or for error/retry states.
  static const discovery = Color(0xFFE8872E);

  /// A correct or complete outcome. Never used for anything else.
  static const success = Color(0xFF3E7C59);

  /// Incorrect/retry feedback — a soft learning yellow, not an alarm.
  static const retryYellow = Color(0xFFE8C978);
  static const retryYellowSoft = Color(0xFFFFF4D6);
  static const retryYellowInk = Color(0xFF7A5A16);

  /// The 8 curriculum-path accents live in the catalog JSON (each path's
  /// `color`), saturation-matched to read on cream. Kept as data, not code,
  /// so grade-8/9 catalogs can bring their own without touching the app.
  /// Reserved for path identity (icons/medallions) only — never for buttons,
  /// progress, or feedback, which use the fixed roles above.
}
