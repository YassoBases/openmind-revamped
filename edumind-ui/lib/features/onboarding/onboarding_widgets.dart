import 'dart:math' as math;
import 'package:flutter/material.dart';

/// OpenMind onboarding design tokens.
///
/// Blue carries structure, headings and trust; warm orange is reserved for
/// the primary CTA, progress and high-priority selection; backgrounds stay
/// warm ivory/cream. No purple, no heavy gradients, no near-black surfaces.
/// The muted Syrian-inspired red/green appear ONLY as very low-alpha washes
/// in the welcome background (see [WelcomePatternPainter]).
class OnbColors {
  static const blue = Color(0xFF1C4E80);
  static const blueInk = Color(0xFF14395C);
  static const softBlue = Color(0xFFE9F1F8);
  static const orange = Color(0xFFE8872E);
  static const ivory = Color(0xFFFDFBF6);
  static const cream = Color(0xFFF3EBDC);
  static const outline = Color(0xFFDFE3E8);
  static const body = Color(0xFF5B6B7C);
  static const mutedGreen = Color(0xFF3E7C59);
  static const mutedRed = Color(0xFF9E4B47);
}

/// Thin segmented progress indicator for the four input steps.
class OnbProgressBar extends StatelessWidget {
  const OnbProgressBar({
    super.key,
    required this.current,
    required this.total,
    required this.semanticLabel,
  });

  /// 0-based index of the active segment.
  final int current;
  final int total;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel,
      child: Row(
        children: [
          for (var i = 0; i < total; i++) ...[
            if (i > 0) const SizedBox(width: 6),
            Expanded(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                height: 6,
                decoration: BoxDecoration(
                  color: i <= current ? OnbColors.orange : OnbColors.cream,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The one primary action of each onboarding screen.
class OnbPrimaryButton extends StatelessWidget {
  const OnbPrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: OnbColors.orange,
        foregroundColor: Colors.white,
        disabledBackgroundColor: OnbColors.orange.withValues(alpha: 0.35),
        disabledForegroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
      ),
      child: busy
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.6, color: Colors.white),
            )
          : Text(label),
    );
  }
}

/// One selectable onboarding card — shared by stage, grade, interest and
/// starting-preference choices so the selected-state logic lives once:
/// light blue tint, clear border, and a small check indicator at the top-end
/// corner (RTL-aware).
class OnbSelectCard extends StatelessWidget {
  const OnbSelectCard({
    super.key,
    required this.selected,
    required this.onTap,
    required this.child,
    this.semanticLabel,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
  });

  final bool selected;
  final VoidCallback onTap;
  final Widget child;
  final String? semanticLabel;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel,
      button: true,
      selected: selected,
      child: Material(
        color: selected ? OnbColors.blue.withValues(alpha: 0.07) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            constraints: const BoxConstraints(minHeight: 48),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: selected ? OnbColors.blue : OnbColors.outline,
                width: selected ? 1.8 : 1.2,
              ),
            ),
            child: Stack(
              children: [
                Padding(padding: padding, child: Center(child: child)),
                PositionedDirectional(
                  top: 6,
                  end: 6,
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 180),
                    opacity: selected ? 1 : 0,
                    child: Container(
                      width: 18,
                      height: 18,
                      decoration: const BoxDecoration(
                        color: OnbColors.blue,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check_rounded, size: 13, color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Welcome background: a quiet Damascene mood — low-contrast eight-point-star
/// geometry in the upper area, a soft arch halo framing the mascot, and two
/// barely-there washes of muted green and muted red. This painter is used on
/// the welcome screen ONLY; the other steps stay plain warm ivory.
class WelcomePatternPainter extends CustomPainter {
  const WelcomePatternPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..isAntiAlias = true;

    // Muted national-color washes, abstract and very subtle (welcome only).
    p.shader = RadialGradient(colors: [
      OnbColors.mutedGreen.withValues(alpha: 0.07),
      OnbColors.mutedGreen.withValues(alpha: 0.0),
    ]).createShader(
        Rect.fromCircle(center: Offset(-30, size.height * 0.18), radius: size.width * 0.55));
    canvas.drawRect(Offset.zero & size, p);
    p.shader = RadialGradient(colors: [
      OnbColors.mutedRed.withValues(alpha: 0.06),
      OnbColors.mutedRed.withValues(alpha: 0.0),
    ]).createShader(Rect.fromCircle(
        center: Offset(size.width + 20, size.height * 0.82), radius: size.width * 0.55));
    canvas.drawRect(Offset.zero & size, p);
    p.shader = null;

    // Sparse eight-point stars drifting through the top half.
    final stroke = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = OnbColors.blue.withValues(alpha: 0.08);
    final rnd = math.Random(7); // fixed seed — same composition every build
    for (var i = 0; i < 9; i++) {
      final x = rnd.nextDouble() * size.width;
      final y = rnd.nextDouble() * size.height * 0.5;
      _star(canvas, stroke, Offset(x, y), 7 + rnd.nextDouble() * 9);
    }

    // Arch halo behind the mascot area (center, upper third).
    final cx = size.width / 2;
    final archTop = size.height * 0.16;
    final archW = math.min(size.width * 0.62, 260.0);
    final archH = archW * 1.12;
    final fill = Paint()
      ..isAntiAlias = true
      ..color = OnbColors.cream.withValues(alpha: 0.55);
    final arch = _archPath(cx, archTop, archW, archH);
    canvas.drawPath(arch, fill);
    stroke
      ..color = OnbColors.blue.withValues(alpha: 0.12)
      ..strokeWidth = 1.4;
    canvas.drawPath(arch, stroke);
  }

  /// Pointed (Damascene) arch: straight sides, gently peaked top.
  Path _archPath(double cx, double top, double w, double h) {
    final left = cx - w / 2;
    final right = cx + w / 2;
    final bottom = top + h;
    return Path()
      ..moveTo(left, bottom)
      ..lineTo(left, top + h * 0.38)
      ..quadraticBezierTo(left, top + h * 0.10, cx - w * 0.16, top + h * 0.035)
      ..quadraticBezierTo(cx, top - h * 0.02, cx + w * 0.16, top + h * 0.035)
      ..quadraticBezierTo(right, top + h * 0.10, right, top + h * 0.38)
      ..lineTo(right, bottom)
      ..close();
  }

  /// Two overlapping rotated squares — the classic eight-point star geometry.
  void _star(Canvas canvas, Paint paint, Offset c, double r) {
    for (final angle in const [0.0, math.pi / 4]) {
      canvas.save();
      canvas.translate(c.dx, c.dy);
      canvas.rotate(angle);
      canvas.drawRect(Rect.fromCenter(center: Offset.zero, width: r * 2, height: r * 2), paint);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(WelcomePatternPainter oldDelegate) => false;
}
