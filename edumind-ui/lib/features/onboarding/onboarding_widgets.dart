import 'dart:math' as math;
import 'package:flutter/material.dart';

/// OpenMind onboarding design tokens — the same fixed OpenMind brand palette
/// as AppColors (token names historical; values are the teal/cream identity).
///
/// Color hierarchy: teal = structure (headings, borders, trust), orange =
/// action and progress (CTA, active step, completion), cream/sand = warm
/// surfaces, soft sky = calm selection surfaces. Green is reserved for
/// success states only. No purple, no neon, no heavy gradients, no
/// near-black. The muted Syrian-inspired red/green appear ONLY as very
/// low-alpha washes in the welcome background ([WelcomePatternPainter]).
class OnbColors {
  static const blue = Color(0xFF079A90);
  static const blueInk = Color(0xFF19725E);
  static const softBlue = Color(0xFFCEEBF0);
  static const orange = Color(0xFFEF9722);
  static const ivory = Color(0xFFFDF2E2);
  static const cream = Color(0xFFFAE9D0);
  static const outline = Color(0xFFEAD9BF);
  static const body = Color(0xFF4E6E64);
  static const mutedGreen = Color(0xFF4D8C58);
  static const mutedRed = Color(0xFF9E4B47);
}

/// Onboarding content rail: on phone-sized viewports the flow fills the
/// screen as usual; on wide (desktop web) viewports it renders inside a
/// centered mobile-like canvas — the same device-shell idea as
/// core/mobile_shell.dart — so fields, cards and the CTA never stretch
/// across the whole browser. The surrounding space stays a quiet cream.
class OnbRail extends StatelessWidget {
  const OnbRail({super.key, required this.child});

  final Widget child;

  /// Mobile-first design width for onboarding content on desktop.
  static const double maxWidth = 460;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth <= maxWidth + 100) return child;
        return ColoredBox(
          color: OnbColors.cream,
          child: Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: maxWidth),
              margin: const EdgeInsets.symmetric(vertical: 28),
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: OnbColors.ivory,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(
                  color: OnbColors.outline.withValues(alpha: 0.8),
                ),
                boxShadow: [
                  BoxShadow(
                    color: OnbColors.blueInk.withValues(alpha: 0.10),
                    blurRadius: 36,
                    offset: const Offset(0, 14),
                  ),
                ],
              ),
              child: child,
            ),
          ),
        );
      },
    );
  }
}

/// Five compact progress dots — the active step is a short orange pill,
/// completed steps are small orange dots, upcoming steps stay quiet.
class OnbStepDots extends StatelessWidget {
  const OnbStepDots({
    super.key,
    required this.current,
    required this.total,
    required this.semanticLabel,
  });

  /// 0-based index of the active step.
  final int current;
  final int total;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < total; i++) ...[
            if (i > 0) const SizedBox(width: 5),
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: i == current ? 18 : 7,
              height: 7,
              decoration: BoxDecoration(
                color: i < current
                    ? OnbColors.orange.withValues(alpha: 0.55)
                    : i == current
                    ? OnbColors.orange
                    : OnbColors.cream,
                border: i > current
                    ? Border.all(color: OnbColors.outline, width: 0.8)
                    : null,
                borderRadius: BorderRadius.circular(4),
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
        minimumSize: const Size(double.infinity, 54),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700),
      ),
      child: busy
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.6,
                color: Colors.white,
              ),
            )
          : Text(label),
    );
  }
}

/// One selectable onboarding card — shared by stage, grade, interest and
/// starting-preference choices so the selected-state logic lives once:
/// soft blue tinted surface, clear blue border, and a small check indicator
/// at the top-end corner (RTL-aware). No heavy shadows or glows.
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
        color: selected ? OnbColors.softBlue : Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            constraints: const BoxConstraints(minHeight: 48),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected ? OnbColors.blue : OnbColors.outline,
                width: selected ? 1.6 : 1.1,
              ),
            ),
            child: Stack(
              children: [
                Padding(
                  padding: padding,
                  child: Center(child: child),
                ),
                PositionedDirectional(
                  top: 6,
                  end: 6,
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 180),
                    opacity: selected ? 1 : 0,
                    child: Container(
                      width: 17,
                      height: 17,
                      decoration: const BoxDecoration(
                        color: OnbColors.blue,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check_rounded,
                        size: 12,
                        color: Colors.white,
                      ),
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

/// Damascene-inspired pointed arch drawn as a widget directly behind the
/// mascot, so bird and arch always stay composed together regardless of
/// screen height (the old version lived in the background painter and
/// drifted apart from the mascot on tall viewports).
class ArchHalo extends StatelessWidget {
  const ArchHalo({
    super.key,
    required this.child,
    this.width = 250,
    this.height = 265,
  });

  final Widget child;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      height: height,
      child: CustomPaint(
        painter: const _ArchPainter(),
        child: Align(alignment: const Alignment(0, 0.75), child: child),
      ),
    );
  }
}

class _ArchPainter extends CustomPainter {
  const _ArchPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final arch = Path()
      ..moveTo(0, h)
      ..lineTo(0, h * 0.34)
      ..quadraticBezierTo(0, h * 0.09, cx - w * 0.17, h * 0.028)
      ..quadraticBezierTo(cx, -h * 0.018, cx + w * 0.17, h * 0.028)
      ..quadraticBezierTo(w, h * 0.09, w, h * 0.34)
      ..lineTo(w, h)
      ..close();
    final fill = Paint()
      ..isAntiAlias = true
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          OnbColors.softBlue.withValues(alpha: 0.9),
          OnbColors.cream.withValues(alpha: 0.75),
        ],
      ).createShader(Offset.zero & size);
    canvas.drawPath(arch, fill);
    final stroke = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = OnbColors.blue.withValues(alpha: 0.22);
    canvas.drawPath(arch, stroke);
    // inner echo line — a quiet second frame, classic arched-doorway detail
    final inset = 9.0;
    final inner = Path()
      ..moveTo(inset, h)
      ..lineTo(inset, h * 0.36)
      ..quadraticBezierTo(inset, h * 0.13, cx - w * 0.15, h * 0.062)
      ..quadraticBezierTo(cx, h * 0.02, cx + w * 0.15, h * 0.062)
      ..quadraticBezierTo(w - inset, h * 0.13, w - inset, h * 0.36)
      ..lineTo(w - inset, h);
    stroke
      ..strokeWidth = 1
      ..color = OnbColors.blue.withValues(alpha: 0.12);
    canvas.drawPath(inner, stroke);
  }

  @override
  bool shouldRepaint(_ArchPainter oldDelegate) => false;
}

/// Welcome background: quiet Damascene mood — low-contrast eight-point-star
/// geometry drifting through the page, a warm ivory→cream vertical depth,
/// and two barely-there washes of muted green and muted red. Used on the
/// welcome screen ONLY; the other steps stay plain warm ivory.
class WelcomePatternPainter extends CustomPainter {
  const WelcomePatternPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..isAntiAlias = true;

    // Warm depth: ivory melting into cream toward the bottom.
    p.shader = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [OnbColors.ivory, OnbColors.cream.withValues(alpha: 0.65)],
    ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, p);

    // Muted national-color washes, abstract and very subtle (welcome only).
    p.shader =
        RadialGradient(
          colors: [
            OnbColors.mutedGreen.withValues(alpha: 0.08),
            OnbColors.mutedGreen.withValues(alpha: 0.0),
          ],
        ).createShader(
          Rect.fromCircle(
            center: Offset(-30, size.height * 0.18),
            radius: size.width * 0.6,
          ),
        );
    canvas.drawRect(Offset.zero & size, p);
    p.shader =
        RadialGradient(
          colors: [
            OnbColors.mutedRed.withValues(alpha: 0.07),
            OnbColors.mutedRed.withValues(alpha: 0.0),
          ],
        ).createShader(
          Rect.fromCircle(
            center: Offset(size.width + 20, size.height * 0.82),
            radius: size.width * 0.6,
          ),
        );
    canvas.drawRect(Offset.zero & size, p);
    p.shader = null;

    // Sparse eight-point stars over the upper two thirds.
    final stroke = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = OnbColors.blue.withValues(alpha: 0.11);
    final rnd = math.Random(7); // fixed seed — same composition every build
    for (var i = 0; i < 12; i++) {
      final x = rnd.nextDouble() * size.width;
      final y = rnd.nextDouble() * size.height * 0.66;
      _star(canvas, stroke, Offset(x, y), 6 + rnd.nextDouble() * 9);
    }
  }

  /// Two overlapping rotated squares — the classic eight-point star geometry.
  void _star(Canvas canvas, Paint paint, Offset c, double r) {
    for (final angle in const [0.0, math.pi / 4]) {
      canvas.save();
      canvas.translate(c.dx, c.dy);
      canvas.rotate(angle);
      canvas.drawRect(
        Rect.fromCenter(center: Offset.zero, width: r * 2, height: r * 2),
        paint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(WelcomePatternPainter oldDelegate) => false;
}
