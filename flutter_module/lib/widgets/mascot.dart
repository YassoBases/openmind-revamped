import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';

/// OpenMind's character duo — the same pair as the Phaser shells, drawn with
/// CustomPainters (implemented twice by design).
///
/// HUDHUD the hoopoe — exploration guide: onboarding, hints, thinking,
///   waiting, gentle moments. Signature crest with black tips + long beak.
/// NAHLA the bee — rewards partner: XP, celebrations, summaries. Constantly
///   fluttering wings; never sad, by design.
enum MascotCharacter { hoopoe, bee }

enum MascotExpression { idle, happy, thinking, sad, celebrating }

class Mascot extends StatefulWidget {
  const Mascot({
    super.key,
    this.size = 140,
    this.accent = const Color(0xFF58CC02),
    this.expression = MascotExpression.happy,
    this.character = MascotCharacter.hoopoe,
  });

  final double size;
  final Color accent;
  final MascotExpression expression;
  final MascotCharacter character;

  @override
  State<Mascot> createState() => _MascotState();
}

class _MascotState extends State<Mascot> with TickerProviderStateMixin {
  late final AnimationController _bob = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: widget.character == MascotCharacter.bee ? 700 : 1200))
    ..repeat(reverse: true);
  late final AnimationController _flutter =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 80))
        ..repeat(reverse: true);
  bool _blinking = false;
  Timer? _blinkTimer;

  @override
  void initState() {
    super.initState();
    _scheduleBlink();
  }

  void _scheduleBlink() {
    _blinkTimer = Timer(Duration(milliseconds: 3500 + math.Random().nextInt(2500)), () {
      if (!mounted) return;
      setState(() => _blinking = true);
      _blinkTimer = Timer(const Duration(milliseconds: 130), () {
        if (!mounted) return;
        setState(() => _blinking = false);
        _scheduleBlink();
      });
    });
  }

  @override
  void dispose() {
    _blinkTimer?.cancel();
    _bob.dispose();
    _flutter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isBee = widget.character == MascotCharacter.bee;
    return AnimatedBuilder(
      animation: Listenable.merge([_bob, _flutter]),
      builder: (context, _) => Transform.translate(
        offset: Offset(0, -(isBee ? 3 : 4) * Curves.easeInOut.transform(_bob.value)),
        child: CustomPaint(
          size: Size(widget.size, widget.size),
          painter: isBee
              ? _BeePainter(
                  accent: widget.accent,
                  expression: widget.expression,
                  blinking: _blinking,
                  wingPhase: _flutter.value,
                )
              : _HoopoePainter(
                  accent: widget.accent,
                  expression: widget.expression,
                  blinking: _blinking,
                ),
        ),
      ),
    );
  }
}

const _ink = Color(0xFF2B2017);

// --------------------------------------------------------------- HOOPOE
class _HoopoePainter extends CustomPainter {
  _HoopoePainter({required this.accent, required this.expression, required this.blinking});

  final Color accent;
  final MascotExpression expression;
  final bool blinking;

  static const body = Color(0xFFE2A266);
  static const cream = Color(0xFFF6E3C8);
  static const dark = Color(0xFF2B2B2B);
  static const white = Color(0xFFF7F3EC);
  static const beak = Color(0xFF4A3B30);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 140;
    canvas.translate(size.width / 2 - 6 * s, size.height * 0.55);
    final p = Paint()..isAntiAlias = true;

    // tail — black with a white band
    p.color = dark;
    _tri(canvas, p, Offset(-22 * s, 2 * s), Offset(-54 * s, 8 * s), Offset(-22 * s, 16 * s));
    p.color = white;
    _tri(canvas, p, Offset(-38 * s, 5.5 * s), Offset(-45 * s, 7.6 * s), Offset(-38 * s, 12.4 * s));

    // crest — feathers fan with the mood, black tips
    final crestPose = switch (expression) {
      MascotExpression.celebrating => _Crest.fan,
      MascotExpression.thinking => _Crest.half,
      MascotExpression.sad => _Crest.droop,
      MascotExpression.happy => _Crest.half,
      _ => _Crest.folded,
    };
    final angles = switch (crestPose) {
      _Crest.fan => [-2.97, -2.62, -2.18, -1.75, -1.31, -0.96],
      _Crest.half => [-2.9, -2.4, -1.92],
      _Crest.droop => [-3.05, -2.93, -2.8],
      _Crest.folded => [-2.55, -2.74, -2.93],
    };
    final len = (crestPose == _Crest.fan ? 31.0 : 26.0) * s;
    final feather = Paint()
      ..isAntiAlias = true
      ..color = body
      ..strokeWidth = 7 * s
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final base = Offset(10 * s, -32 * s);
    for (final a in angles) {
      final tip = base + Offset(math.cos(a) * len, math.sin(a) * len);
      canvas.drawLine(base, tip, feather);
      p.color = dark;
      canvas.drawCircle(tip, 4.2 * s, p);
    }

    // body + belly
    p.color = body;
    canvas.drawOval(Rect.fromCenter(center: Offset(0, 10 * s), width: 54 * s, height: 44 * s), p);
    p.color = cream;
    canvas.drawOval(Rect.fromCenter(center: Offset(4 * s, 18 * s), width: 34 * s, height: 24 * s), p);

    // legs
    final leg = Paint()
      ..color = beak
      ..strokeWidth = 3.5 * s
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    canvas.drawLine(Offset(-6 * s, 30 * s), Offset(-8 * s, 44 * s), leg);
    canvas.drawLine(Offset(6 * s, 30 * s), Offset(6 * s, 44 * s), leg);
    canvas.drawLine(Offset(-12 * s, 44 * s), Offset(-4 * s, 44 * s), leg);
    canvas.drawLine(Offset(2 * s, 44 * s), Offset(10 * s, 44 * s), leg);

    // accent scarf
    p.color = accent;
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(2 * s, -12 * s, 22 * s, 8 * s), Radius.circular(4 * s)), p);
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(16 * s, -8 * s, 8 * s, 16 * s), Radius.circular(4 * s)), p);

    // folded striped wing
    p.color = dark;
    canvas.drawOval(Rect.fromCenter(center: Offset(-8 * s, 6 * s), width: 32 * s, height: 17 * s), p);
    p.color = white;
    canvas.drawRect(Rect.fromLTWH(-16 * s, -1 * s, 4.5 * s, 14 * s), p);
    canvas.drawRect(Rect.fromLTWH(-7 * s, -2 * s, 4.5 * s, 16 * s), p);

    // head + the long curved beak
    p.color = body;
    canvas.drawCircle(Offset(16 * s, -22 * s), 16 * s, p);
    p.color = beak;
    _tri(canvas, p, Offset(28 * s, -27 * s), Offset(28 * s, -20 * s), Offset(56 * s, -16 * s));
    _tri(canvas, p, Offset(40 * s, -22.5 * s), Offset(40 * s, -18.5 * s), Offset(56 * s, -16 * s));

    // face
    final ex = 20.0 * s, ey = -26.0 * s;
    final stroke = Paint()
      ..isAntiAlias = true
      ..color = _ink
      ..strokeWidth = 3.4 * s
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final happy = expression == MascotExpression.happy || expression == MascotExpression.celebrating;
    if (blinking) {
      canvas.drawLine(Offset(ex - 5 * s, ey + 1 * s), Offset(ex + 5 * s, ey + 1 * s), stroke);
    } else if (happy) {
      canvas.drawArc(Rect.fromCircle(center: Offset(ex, ey + 1.5 * s), radius: 5 * s),
          math.pi * 1.15, math.pi * 0.7, false, stroke);
      p.color = const Color(0x66FF9D8A);
      canvas.drawCircle(Offset(10 * s, -14 * s), 4.5 * s, p);
    } else {
      p.color = Colors.white;
      canvas.drawCircle(Offset(ex, ey), 5.5 * s, p);
      p.color = _ink;
      canvas.drawCircle(Offset(ex + 1 * s, ey + (expression == MascotExpression.sad ? 2.5 : 0.5) * s), 3.2 * s, p);
    }

    if (expression == MascotExpression.sad) {
      final brow = Paint()
        ..color = const Color(0xFFC9854A)
        ..strokeWidth = 3 * s
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;
      canvas.drawLine(Offset(ex - 6 * s, ey - 7 * s), Offset(ex + 5 * s, ey - 4 * s), brow);
      p.color = const Color(0xFF9ADCFF);
      canvas.drawOval(Rect.fromCenter(center: Offset(ex - 2 * s, ey + 10 * s), width: 4 * s, height: 6 * s), p);
    }

    if (expression == MascotExpression.celebrating) {
      p.color = const Color(0xFF7C3B2A);
      _tri(canvas, p, Offset(30 * s, -19 * s), Offset(38 * s, -14 * s), Offset(30 * s, -12 * s));
    }

    if (expression == MascotExpression.thinking) {
      p.color = Colors.white.withValues(alpha: 0.94);
      canvas.drawCircle(Offset(44 * s, -52 * s), 11 * s, p);
      canvas.drawCircle(Offset(35 * s, -42 * s), 4 * s, p);
      final q = TextPainter(
        text: TextSpan(text: '?', style: TextStyle(color: _ink, fontSize: 13 * s, fontWeight: FontWeight.w800)),
        textDirection: TextDirection.ltr,
      )..layout();
      q.paint(canvas, Offset(44 * s - q.width / 2, -52 * s - q.height / 2));
    }
  }

  void _tri(Canvas c, Paint p, Offset a, Offset b, Offset d) {
    c.drawPath(Path()..moveTo(a.dx, a.dy)..lineTo(b.dx, b.dy)..lineTo(d.dx, d.dy)..close(), p);
  }

  @override
  bool shouldRepaint(_HoopoePainter old) =>
      old.expression != expression || old.blinking != blinking || old.accent != accent;
}

enum _Crest { folded, half, fan, droop }

// ------------------------------------------------------------------ BEE
class _BeePainter extends CustomPainter {
  _BeePainter({
    required this.accent,
    required this.expression,
    required this.blinking,
    required this.wingPhase,
  });

  final Color accent;
  final MascotExpression expression;
  final bool blinking;
  final double wingPhase; // 0..1 — constant flutter

  static const yellow = Color(0xFFFFD24A);
  static const stripe = Color(0xFF2B2B2B);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 110;
    canvas.translate(size.width / 2, size.height * 0.56);
    final p = Paint()..isAntiAlias = true;

    // fluttering wings (scaleY follows wingPhase)
    final wingScale = 0.45 + 0.55 * wingPhase;
    canvas.save();
    canvas.translate(2 * s, -18 * s);
    canvas.scale(1, wingScale);
    p.color = Colors.white.withValues(alpha: 0.68);
    canvas.drawOval(Rect.fromCenter(center: Offset(-6 * s, 0), width: 26 * s, height: 17 * s), p);
    canvas.drawOval(Rect.fromCenter(center: Offset(10 * s, 2 * s), width: 21 * s, height: 14 * s), p);
    canvas.restore();

    // body + stripes
    p.color = yellow;
    canvas.drawOval(Rect.fromCenter(center: Offset(2 * s, 0), width: 40 * s, height: 32 * s), p);
    p.color = stripe;
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(-2 * s, -15 * s, 8 * s, 30 * s), Radius.circular(4 * s)), p);
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(10 * s, -13 * s, 7 * s, 26 * s), Radius.circular(3.5 * s)), p);
    p.color = yellow;
    canvas.drawCircle(Offset(20 * s, 0), 7 * s, p); // rounded tail, no stinger

    // head + antennae
    canvas.drawCircle(Offset(-18 * s, -3 * s), 12 * s, p);
    final ant = Paint()
      ..color = stripe
      ..strokeWidth = 2.5 * s
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    canvas.drawLine(Offset(-22 * s, -13 * s), Offset(-27 * s, -22 * s), ant);
    canvas.drawLine(Offset(-16 * s, -14 * s), Offset(-15 * s, -24 * s), ant);
    p.color = stripe;
    canvas.drawCircle(Offset(-27.5 * s, -23 * s), 2.2 * s, p);
    canvas.drawCircle(Offset(-15 * s, -25 * s), 2.2 * s, p);

    // accent pollen dot
    p.color = accent;
    canvas.drawCircle(Offset(2 * s, 14 * s), 4.5 * s, p);

    // face — the bee never goes sad (rewards partner), sad maps to idle
    final ex = -21.0 * s, ey = -6.0 * s;
    final stroke = Paint()
      ..isAntiAlias = true
      ..color = _ink
      ..strokeWidth = 2.8 * s
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final celebratory =
        expression == MascotExpression.celebrating || expression == MascotExpression.happy;
    if (blinking) {
      for (final dx in [0.0, 7.0]) {
        canvas.drawLine(Offset(ex + (dx - 3) * s, ey + 1 * s), Offset(ex + (dx + 3) * s, ey + 1 * s), stroke);
      }
    } else if (celebratory) {
      for (final dx in [0.0, 7.0]) {
        canvas.drawArc(Rect.fromCircle(center: Offset(ex + dx * s, ey + 1 * s), radius: 3.4 * s),
            math.pi * 1.15, math.pi * 0.7, false, stroke);
      }
    } else {
      for (final dx in [0.0, 7.0]) {
        p.color = Colors.white;
        canvas.drawCircle(Offset(ex + dx * s, ey), 3.6 * s, p);
        p.color = _ink;
        canvas.drawCircle(Offset(ex + (dx + 0.7) * s, ey + 0.5 * s), 2 * s, p);
      }
    }
    // smile
    canvas.drawArc(
        Rect.fromCircle(center: Offset((ex + 3 * s), ey + 6 * s),
            radius: (expression == MascotExpression.celebrating ? 5 : 3.5) * s),
        math.pi * 0.15, math.pi * 0.7, false, stroke);
    if (expression == MascotExpression.celebrating) {
      p.color = const Color(0xFF7C3B2A);
      canvas.drawOval(
          Rect.fromCenter(center: Offset(ex + 3 * s, ey + 7.5 * s), width: 5.5 * s, height: 4 * s), p);
    }
  }

  @override
  bool shouldRepaint(_BeePainter old) =>
      old.expression != expression ||
      old.blinking != blinking ||
      old.accent != accent ||
      old.wingPhase != wingPhase;
}
