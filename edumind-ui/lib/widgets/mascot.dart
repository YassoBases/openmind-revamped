import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// OpenMind's brand character duo — a direct port of the Phaser shells'
/// `mascot.js` geometry (implemented twice by design, same coordinates).
///
/// HUDHUD the hoopoe — exploration, curiosity & hints. Warm-orange body,
///   big eyes with expressive brows, long down-curved grey beak, and the
///   signature fan crest: orange feathers each with a white band + black
///   rounded tip. The crest is his tell — it sways while idle, fans wide
///   when celebrating, droops when consoling.
/// NAHLA the bee — companionship, progress & accomplishment. Big round
///   head, fuzzy yellow body with soft brown stripes, teal scarf, blue
///   translucent wings fluttering constantly, and her glowing golden XP
///   hexagon held up whenever the student earns something. Never sad.
///
/// Both wear the student's accent color and are never perfectly still:
/// idle bob, crest sway / wing flutter, antenna sway, blinks, sparkle
/// twinkle, and a springy pop when the expression changes.
enum MascotCharacter { hoopoe, bee }

enum MascotExpression { idle, happy, thinking, sad, celebrating }

class Mascot extends StatefulWidget {
  const Mascot({
    super.key,
    this.size = 140,
    this.accent = const Color(0xFFEF9722), // AppColors.orange — warm default

    this.expression = MascotExpression.happy,
    this.character = MascotCharacter.hoopoe,
    this.showXp,
  });

  final double size;
  final Color accent;
  final MascotExpression expression;
  final MascotCharacter character;

  /// Nahla's XP hexagon. null = automatic (shown when happy/celebrating).
  final bool? showXp;

  @override
  State<Mascot> createState() => _MascotState();
}

class _MascotState extends State<Mascot> with TickerProviderStateMixin {
  final ValueNotifier<double> _time = ValueNotifier(0); // seconds, monotonic
  final ValueNotifier<bool> _blink = ValueNotifier(false);
  late final Ticker _ticker;
  late final AnimationController _pop; // springy punch on expression change
  Timer? _blinkTimer;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((e) => _time.value = e.inMicroseconds / 1e6)..start();
    _pop = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 460), value: 1);
    _scheduleBlink();
  }

  void _scheduleBlink() {
    _blinkTimer = Timer(Duration(milliseconds: 3500 + math.Random().nextInt(2500)), () {
      if (!mounted) return;
      _blink.value = true;
      _blinkTimer = Timer(const Duration(milliseconds: 130), () {
        if (!mounted) return;
        _blink.value = false;
        _scheduleBlink();
      });
    });
  }

  @override
  void didUpdateWidget(Mascot old) {
    super.didUpdateWidget(old);
    if (old.expression != widget.expression) _pop.forward(from: 0);
  }

  @override
  void dispose() {
    _blinkTimer?.cancel();
    _ticker.dispose();
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final repaint = Listenable.merge([_time, _blink, _pop]);
    final isBee = widget.character == MascotCharacter.bee;
    return CustomPaint(
      size: Size.square(widget.size),
      painter: isBee
          ? _NahlaPainter(
              repaint: repaint,
              time: _time,
              blink: _blink,
              pop: _pop,
              accent: widget.accent,
              expression: widget.expression,
              showXp: widget.showXp ??
                  (widget.expression == MascotExpression.celebrating ||
                      widget.expression == MascotExpression.happy),
            )
          : _HudhudPainter(
              repaint: repaint,
              time: _time,
              blink: _blink,
              pop: _pop,
              accent: widget.accent,
              expression: widget.expression,
            ),
    );
  }
}

/// A rounded speech bubble with a tail pointing toward the mascot beside it
/// (tail on the start side, so it flips automatically in RTL).
class SpeechBubble extends StatelessWidget {
  const SpeechBubble({
    super.key,
    required this.text,
    this.color = const Color(0xFFF6EFE2),
    this.textColor = _ink,
    this.fontSize = 13,
  });

  final String text;
  final Color color;
  final Color textColor;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return CustomPaint(
      painter: _BubblePainter(color: color, tailOnRight: rtl),
      child: Padding(
        padding: EdgeInsetsDirectional.only(start: 16, end: 12, top: 8, bottom: 8),
        child: Text(text,
            style: TextStyle(
                color: textColor, fontSize: fontSize, fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _BubblePainter extends CustomPainter {
  _BubblePainter({required this.color, required this.tailOnRight});

  final Color color;
  final bool tailOnRight;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..isAntiAlias = true
      ..color = color;
    final body = tailOnRight
        ? Rect.fromLTWH(0, 0, size.width - 8, size.height)
        : Rect.fromLTWH(8, 0, size.width - 8, size.height);
    canvas.drawRRect(RRect.fromRectAndRadius(body, const Radius.circular(12)), p);
    final tail = Path();
    final cy = size.height / 2;
    if (tailOnRight) {
      tail
        ..moveTo(size.width - 8, cy - 6)
        ..lineTo(size.width, cy)
        ..lineTo(size.width - 8, cy + 6);
    } else {
      tail
        ..moveTo(8, cy - 6)
        ..lineTo(0, cy)
        ..lineTo(8, cy + 6);
    }
    tail.close();
    canvas.drawPath(tail, p);
  }

  @override
  bool shouldRepaint(_BubblePainter old) =>
      old.color != color || old.tailOnRight != tailOnRight;
}

const _ink = Color(0xFF2B2017);

Color _c(int rgb, [double a = 1]) => Color(0xFF000000 | rgb).withValues(alpha: a);

// --------------------------------------------------------------- HUDHUD
class _HudhudPainter extends CustomPainter {
  _HudhudPainter({
    required Listenable repaint,
    required this.time,
    required this.blink,
    required this.pop,
    required this.accent,
    required this.expression,
  }) : super(repaint: repaint);

  final ValueNotifier<double> time;
  final ValueNotifier<bool> blink;
  final AnimationController pop;
  final Color accent;
  final MascotExpression expression;

  // same palette as mascot.js HP
  static final body = _c(0xF3993D);
  static final bodyLight = _c(0xF8B766);
  static final belly = _c(0xF7C98A);
  static final bodyDark = _c(0xDD7A26);
  static final crestBand = _c(0xF6EFE2);
  static final crestTip = _c(0x2C2C2C);
  static final beak = _c(0x6F6A64);
  static final beakDark = _c(0x514C46);
  static final wingBand = _c(0xF6EFE2);
  static final wingDark = _c(0x2C2C2C);
  static final wingTip = _c(0x4A382C);
  static final leg = _c(0x5A4A3E);

  @override
  void paint(Canvas canvas, Size size) {
    final t = time.value;
    final s = size.width / 195; // unit space ≈ mascot.js coordinates
    final bob = -3 * (1 + math.sin(2 * math.pi * t / 2.6)); // idle bob, never still
    canvas.translate(size.width * 0.42, size.height * 0.625 + bob * s);
    canvas.scale(s);

    // occasional curious head-cock while idle
    if (expression == MascotExpression.idle) {
      final tilt = -0.10 * math.pow(math.max(0, math.sin(2 * math.pi * t / 7.3)), 12);
      canvas.rotate(tilt.toDouble());
    }

    final p = Paint()..isAntiAlias = true;
    final stroke = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    // legs + three-toed feet
    stroke
      ..color = leg
      ..strokeWidth = 4;
    for (final lx in [-9.0, 9.0]) {
      final fx = lx + (lx < 0 ? -1 : 1);
      canvas.drawLine(Offset(lx, 34), Offset(fx, 58), stroke);
      canvas.drawLine(Offset(fx - 1, 58), Offset(fx - 8, 63), stroke);
      canvas.drawLine(Offset(fx, 58), Offset(fx, 64), stroke);
      canvas.drawLine(Offset(fx + 1, 58), Offset(fx + 8, 63), stroke);
    }

    // tail — banded black/white, sweeping down-left behind
    p.color = wingDark;
    _tri(canvas, p, const Offset(-14, 24), const Offset(-52, 50), const Offset(-10, 44));
    p.color = wingBand;
    _tri(canvas, p, const Offset(-22, 33), const Offset(-40, 44), const Offset(-16, 41));

    _crest(canvas, t);

    // body: plump egg, lighter chest, cream belly
    p.color = body;
    canvas.drawOval(Rect.fromCenter(center: const Offset(0, 16), width: 66, height: 86), p);
    p.color = bodyLight;
    canvas.drawOval(Rect.fromCenter(center: const Offset(2, 6), width: 54, height: 60), p);
    p.color = belly;
    canvas.drawOval(Rect.fromCenter(center: const Offset(4, 26), width: 38, height: 46), p);

    // head + soft brow-ridge shading
    p.color = bodyLight;
    canvas.drawCircle(const Offset(8, -34), 27, p);
    p.color = body.withValues(alpha: 0.5);
    canvas.drawOval(Rect.fromCenter(center: const Offset(8, -48), width: 40, height: 18), p);

    // long, thin, down-curved beak (quadratic bezier wedge)
    final beakPath = Path()
      ..moveTo(30, -30)
      ..quadraticBezierTo(74, -22, 96, -2)
      ..quadraticBezierTo(70, -16, 30, -22)
      ..close();
    p.color = beak;
    canvas.drawPath(beakPath, p);
    stroke
      ..color = beakDark.withValues(alpha: 0.6)
      ..strokeWidth = 2;
    canvas.drawPath(
        Path()
          ..moveTo(30, -22)
          ..quadraticBezierTo(70, -16, 96, -2),
        stroke);

    _wing(canvas, raised: expression == MascotExpression.celebrating);
    _face(canvas, t);
  }

  /// Fan crest: orange shaft + white band + black rounded tip per feather,
  /// rotating around its base with a constant curious sway.
  void _crest(Canvas canvas, double t) {
    final pose = switch (expression) {
      MascotExpression.celebrating => _Crest.fan,
      MascotExpression.thinking || MascotExpression.happy => _Crest.half,
      MascotExpression.sad => _Crest.droop,
      _ => _Crest.folded,
    };
    final (angles, len) = switch (pose) {
      _Crest.folded => (const [-2.32, -2.06, -1.8, -1.54, -1.28, -1.02], 42.0),
      _Crest.half => (const [-2.5, -2.16, -1.82, -1.48, -1.14, -0.8], 50.0),
      _Crest.fan => (const [-2.74, -2.4, -2.06, -1.72, -1.38, -1.04, -0.7, -0.36], 58.0),
      _Crest.droop => (const [-2.75, -2.52, -2.29, -2.06], 36.0),
    };
    canvas.save();
    canvas.translate(4, -50);
    canvas.rotate(0.06 * math.sin(2 * math.pi * t / 3.4)); // gentle sway
    if (pose == _Crest.fan) {
      final k = 0.5 + 0.5 * Curves.easeOutBack.transform(pop.value); // springy pop
      canvas.scale(k);
    }
    final shaft = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 8
      ..color = body;
    final band = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 8.6
      ..color = crestBand;
    final p = Paint()..isAntiAlias = true;
    final mid = (angles.length - 1) / 2;
    for (var i = 0; i < angles.length; i++) {
      final a = angles[i];
      final l = len * (1 - (i - mid).abs() / (mid + 2) * 0.28);
      final dir = Offset(math.cos(a), math.sin(a));
      canvas.drawLine(Offset.zero, dir * (l - 13), shaft);
      p.color = body;
      canvas.drawCircle(Offset.zero, 4, p);
      canvas.drawLine(dir * (l - 13.5), dir * (l - 7.5), band);
      p.color = crestTip;
      canvas.drawCircle(dir * l, 5.6, p);
      p.color = accent.withValues(alpha: 0.5);
      canvas.drawCircle(dir * l, 2.2, p);
    }
    canvas.restore();
  }

  void _wing(Canvas canvas, {required bool raised}) {
    final p = Paint()..isAntiAlias = true;
    canvas.save();
    canvas.translate(-16, 8);
    if (raised) {
      // extended wing pointing forward-down ("look over there!")
      p.color = wingTip;
      canvas.drawOval(Rect.fromCenter(center: const Offset(46, 8), width: 64, height: 26), p);
      p.color = wingBand;
      canvas.drawOval(Rect.fromCenter(center: const Offset(26, 2), width: 30, height: 20), p);
      p.color = wingDark;
      canvas.drawOval(Rect.fromCenter(center: const Offset(38, 5), width: 16, height: 18), p);
    } else {
      // folded along the flank, tilted back: stacked cream/black bands
      canvas.rotate(-0.55);
      p.color = wingDark;
      canvas.drawOval(Rect.fromCenter(center: const Offset(0, 14), width: 30, height: 52), p);
      p.color = wingBand;
      canvas.drawOval(Rect.fromCenter(center: const Offset(-1, 2), width: 27, height: 12), p);
      canvas.drawOval(Rect.fromCenter(center: const Offset(0, 20), width: 25, height: 10), p);
      p.color = wingDark;
      canvas.drawOval(Rect.fromCenter(center: const Offset(0, 11), width: 23, height: 8), p);
      p.color = wingTip;
      canvas.drawOval(Rect.fromCenter(center: const Offset(2, 34), width: 20, height: 16), p);
    }
    canvas.restore();
  }

  void _face(Canvas canvas, double t) {
    final p = Paint()..isAntiAlias = true;
    final stroke = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    const eL = Offset(2, -36); // back eye
    const eR = Offset(18, -34); // toward the beak

    void openEye(Offset e, double r) {
      p.color = Colors.white;
      canvas.drawCircle(e, r, p);
      p.color = _ink;
      canvas.drawCircle(e + const Offset(1.2, 0.6), r * 0.62, p);
      p.color = Colors.white;
      canvas.drawCircle(e + Offset(r * 0.32, -r * 0.34), r * 0.24, p);
    }

    void closedEye(Offset e, double r) {
      stroke
        ..color = _ink
        ..strokeWidth = 3;
      canvas.drawArc(Rect.fromCircle(center: e, radius: r), math.pi * 0.15, math.pi * 0.7,
          false, stroke);
    }

    void crescentEye(Offset e, double r) {
      stroke
        ..color = _ink
        ..strokeWidth = 3.2;
      canvas.drawArc(Rect.fromCircle(center: e + const Offset(0, 2), radius: r),
          math.pi * 1.12, math.pi * 0.76, false, stroke);
    }

    // expressive dark brows — key to the brand look
    void brows(double lift, double angle) {
      stroke
        ..color = bodyDark
        ..strokeWidth = 3.4;
      canvas.drawLine(Offset(eL.dx - 7, eL.dy - 9 - lift + angle),
          Offset(eL.dx + 6, eL.dy - 11 - lift), stroke);
      canvas.drawLine(Offset(eR.dx - 6, eR.dy - 11 - lift),
          Offset(eR.dx + 8, eR.dy - 9 - lift + angle), stroke);
    }

    void blush() {
      p.color = _c(0xFF9D6A, 0.32);
      canvas.drawCircle(const Offset(-4, -22), 6, p);
      canvas.drawCircle(const Offset(26, -20), 6, p);
    }

    final blinking = blink.value;
    switch (expression) {
      case MascotExpression.happy:
        crescentEye(eL, 7);
        crescentEye(eR, 7);
        brows(2, 0);
        blush();
      case MascotExpression.celebrating:
        crescentEye(eL, 8);
        crescentEye(eR, 8);
        brows(3, 0);
        blush();
        _sparkle(canvas, const Offset(-22, -58), t, 0);
        _sparkle(canvas, const Offset(40, -56), t, 0.8);
      case MascotExpression.thinking:
        if (blinking) {
          closedEye(eL, 7);
          closedEye(eR, 7);
        } else {
          openEye(eL, 7);
          openEye(eR, 8);
        }
        brows(5, -3); // one raised — quizzical
        p.color = Colors.white.withValues(alpha: 0.96);
        canvas.drawCircle(const Offset(44, -62), 12, p);
        canvas.drawCircle(const Offset(33, -50), 4.5, p);
        p.color = _ink;
        // dots pulse one-by-one while he thinks
        for (var i = 0; i < 3; i++) {
          final on = ((t * 2).floor() % 3) == i;
          canvas.drawCircle(Offset(40.0 + i * 4, -64.0 + i * 2), on ? 2.4 : 1.8, p);
        }
      case MascotExpression.sad:
        openEye(eL, 6.5);
        openEye(eR, 7);
        // worried up-tilted brows
        stroke
          ..color = bodyDark
          ..strokeWidth = 3.2;
        canvas.drawLine(Offset(eL.dx - 7, eL.dy - 6), Offset(eL.dx + 6, eL.dy - 11), stroke);
        canvas.drawLine(Offset(eR.dx - 6, eR.dy - 11), Offset(eR.dx + 8, eR.dy - 6), stroke);
        // a tear that slowly slides
        final drop = (t % 1.6) / 1.6;
        p.color = _c(0x9ADCFF, 1 - drop * 0.6);
        canvas.drawOval(
            Rect.fromCenter(
                center: Offset(eL.dx - 6, eL.dy + 8 + drop * 7), width: 4, height: 6),
            p);
      case MascotExpression.idle:
        if (blinking) {
          closedEye(eL, 7);
          closedEye(eR, 7);
        } else {
          openEye(eL, 7);
          openEye(eR, 8);
        }
        brows(2, 0);
    }
  }

  void _sparkle(Canvas canvas, Offset c, double t, double seed) {
    final tw = 0.5 + 0.5 * math.sin(2 * math.pi * t / 0.9 + seed * 4);
    final p = Paint()
      ..isAntiAlias = true
      ..color = _c(0xFFE27A, 0.5 + 0.5 * tw);
    final r = 2.5 + 3 * tw;
    _tri(canvas, p, c + Offset(0, -r), c + Offset(-r * 0.4, 0), c + Offset(r * 0.4, 0));
    _tri(canvas, p, c + Offset(0, r), c + Offset(-r * 0.4, 0), c + Offset(r * 0.4, 0));
    _tri(canvas, p, c + Offset(-r, 0), c + Offset(0, -r * 0.4), c + Offset(0, r * 0.4));
    _tri(canvas, p, c + Offset(r, 0), c + Offset(0, -r * 0.4), c + Offset(0, r * 0.4));
  }

  @override
  bool shouldRepaint(_HudhudPainter old) =>
      old.expression != expression || old.accent != accent;
}

enum _Crest { folded, half, fan, droop }

void _tri(Canvas c, Paint p, Offset a, Offset b, Offset d) {
  c.drawPath(
      Path()
        ..moveTo(a.dx, a.dy)
        ..lineTo(b.dx, b.dy)
        ..lineTo(d.dx, d.dy)
        ..close(),
      p);
}

// ---------------------------------------------------------------- NAHLA
class _NahlaPainter extends CustomPainter {
  _NahlaPainter({
    required Listenable repaint,
    required this.time,
    required this.blink,
    required this.pop,
    required this.accent,
    required this.expression,
    required this.showXp,
  }) : super(repaint: repaint);

  final ValueNotifier<double> time;
  final ValueNotifier<bool> blink;
  final AnimationController pop;
  final Color accent;
  final MascotExpression expression;
  final bool showXp;

  // same palette as mascot.js BEE
  static final body = _c(0xFFC83D);
  static final bodyLight = _c(0xFFD862);
  static final stripe = _c(0x6B4A2B);
  static final limb = _c(0x5A3D22);
  static final scarf = _c(0x2BC4C4);
  static final scarfDark = _c(0x1F9C9C);
  static final wing = _c(0xA9DCF2);
  static final wingEdge = _c(0x7CC4E6);
  static final xpGold = _c(0xFFC62E);
  static final xpGoldLight = _c(0xFFE07A);
  static final xpGoldDark = _c(0xE0A318);
  static final sparkle = _c(0xFFE08A);
  static const eye = Color(0xFF4A2E1A);

  @override
  void paint(Canvas canvas, Size size) {
    final t = time.value;
    final s = size.width / 125;
    final bob = -2.5 * (1 + math.sin(2 * math.pi * t / 1.44)); // hover
    canvas.translate(size.width * 0.40, size.height * 0.65 + bob * s);
    canvas.scale(s);

    final p = Paint()..isAntiAlias = true;

    // fluttering translucent wings — a bee is never still
    canvas.save();
    canvas.translate(16, -20);
    canvas.scale(1, 0.75 + 0.25 * math.sin(2 * math.pi * t * 9));
    p.color = wing.withValues(alpha: 0.62);
    canvas.drawOval(Rect.fromCenter(center: const Offset(12, -10), width: 42, height: 26), p);
    canvas.drawOval(Rect.fromCenter(center: const Offset(26, 6), width: 32, height: 18), p);
    final edge = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = wingEdge.withValues(alpha: 0.85);
    canvas.drawOval(Rect.fromCenter(center: const Offset(12, -10), width: 42, height: 26), edge);
    canvas.drawOval(Rect.fromCenter(center: const Offset(26, 6), width: 32, height: 18), edge);
    edge
      ..strokeWidth = 1
      ..color = wingEdge.withValues(alpha: 0.5);
    canvas.drawLine(const Offset(0, -12), const Offset(26, -8), edge);
    canvas.drawLine(const Offset(8, 4), const Offset(34, 6), edge);
    canvas.restore();

    final pulse = 0.5 + 0.5 * math.sin(2 * math.pi * t / 1.4);
    if (showXp) {
      // glow halo behind the coin, pulsing
      canvas.save();
      canvas.translate(0, 6);
      final k = 1 + 0.12 * pulse;
      canvas.scale(k);
      p.color = xpGoldLight.withValues(alpha: 0.28 * (0.6 + 0.4 * pulse));
      canvas.drawCircle(Offset.zero, 27, p);
      p.color = xpGoldLight.withValues(alpha: 0.18 * (0.6 + 0.4 * pulse));
      canvas.drawCircle(Offset.zero, 35, p);
      canvas.restore();
    }

    // round fuzzy abdomen with soft brown stripes
    p.color = body;
    canvas.drawOval(Rect.fromCenter(center: const Offset(0, 12), width: 50, height: 46), p);
    p.color = stripe;
    canvas.drawOval(Rect.fromCenter(center: const Offset(0, 4), width: 46, height: 10), p);
    canvas.drawOval(Rect.fromCenter(center: const Offset(0, 20), width: 40, height: 10), p);
    p.color = body;
    canvas.drawOval(Rect.fromCenter(center: const Offset(0, 12), width: 46, height: 7), p);
    p.color = bodyLight.withValues(alpha: 0.5);
    canvas.drawOval(Rect.fromCenter(center: const Offset(-8, 6), width: 18, height: 14), p);
    // big round head — almost half the character, like the reference
    p.color = body;
    canvas.drawCircle(const Offset(-2, -26), 25, p);
    p.color = bodyLight.withValues(alpha: 0.45);
    canvas.drawOval(Rect.fromCenter(center: const Offset(-10, -34), width: 16, height: 12), p);
    // teal scarf with the student's accent trim
    p.color = scarf;
    canvas.drawRRect(
        RRect.fromRectAndRadius(const Rect.fromLTWH(-16, -7, 32, 9), const Radius.circular(4)), p);
    p.color = scarfDark;
    canvas.drawRRect(
        RRect.fromRectAndRadius(const Rect.fromLTWH(-16, -3, 32, 4), const Radius.circular(2)), p);
    p.color = scarf;
    canvas.drawRRect(
        RRect.fromRectAndRadius(const Rect.fromLTWH(8, -2, 9, 16), const Radius.circular(4)), p);
    p.color = accent;
    canvas.drawRRect(
        RRect.fromRectAndRadius(const Rect.fromLTWH(-16, -7, 32, 3), const Radius.circular(2)), p);

    _arms(canvas, holding: showXp);
    _antennae(canvas, t);
    _face(canvas);

    if (showXp) {
      _coin(canvas);
      _sparkles(canvas, (t % 1.6) / 1.6);
    }
  }

  void _arms(Canvas canvas, {required bool holding}) {
    final p = Paint()
      ..isAntiAlias = true
      ..color = limb;
    if (holding) {
      // both plush arms up, holding the XP coin in front
      canvas.drawRRect(
          RRect.fromRectAndRadius(const Rect.fromLTWH(-26, 0, 9, 16), const Radius.circular(4)), p);
      canvas.drawRRect(
          RRect.fromRectAndRadius(const Rect.fromLTWH(17, 0, 9, 16), const Radius.circular(4)), p);
      canvas.drawCircle(const Offset(-22, 2), 5, p);
      canvas.drawCircle(const Offset(22, 2), 5, p);
    } else {
      canvas.drawRRect(
          RRect.fromRectAndRadius(const Rect.fromLTWH(-26, 6, 8, 14), const Radius.circular(4)), p);
      canvas.drawRRect(
          RRect.fromRectAndRadius(const Rect.fromLTWH(18, 6, 8, 14), const Radius.circular(4)), p);
      canvas.drawCircle(const Offset(-22, 19), 4.5, p);
      canvas.drawCircle(const Offset(22, 19), 4.5, p);
    }
    canvas.drawOval(Rect.fromCenter(center: const Offset(-8, 36), width: 12, height: 8), p);
    canvas.drawOval(Rect.fromCenter(center: const Offset(9, 36), width: 12, height: 8), p);
  }

  void _antennae(Canvas canvas, double t) {
    canvas.save();
    canvas.translate(-2, -44);
    canvas.rotate(0.08 * math.sin(2 * math.pi * t / 2.8)); // sway
    final a = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 4.2
      ..color = limb;
    canvas.drawPath(
        Path()
          ..moveTo(-6, 2)
          ..quadraticBezierTo(-12, -14, -17, -24),
        a);
    canvas.drawPath(
        Path()
          ..moveTo(8, 2)
          ..quadraticBezierTo(12, -14, 18, -24),
        a);
    final p = Paint()
      ..isAntiAlias = true
      ..color = limb;
    canvas.drawCircle(const Offset(-17, -24), 4.2, p);
    canvas.drawCircle(const Offset(18, -24), 4.2, p);
    canvas.restore();
  }

  void _face(Canvas canvas) {
    final p = Paint()..isAntiAlias = true;
    final stroke = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..color = eye;
    const eL = Offset(-11, -27), eR = Offset(7, -27);

    void openEyes(double r) {
      for (final e in const [eL, eR]) {
        p.color = Colors.white;
        canvas.drawCircle(e, r, p);
        p.color = eye;
        canvas.drawCircle(e + const Offset(0.8, 0.6), r * 0.62, p);
        p.color = Colors.white;
        canvas.drawCircle(e + Offset(r * 0.3, -r * 0.3), r * 0.22, p);
      }
    }

    void happyEyes() {
      stroke.strokeWidth = 3.2;
      for (final e in const [eL, eR]) {
        canvas.drawArc(Rect.fromCircle(center: e + const Offset(0, 1), radius: 5.2),
            math.pi * 1.12, math.pi * 0.76, false, stroke);
      }
    }

    void closedEyes() {
      stroke.strokeWidth = 3.2;
      for (final e in const [eL, eR]) {
        canvas.drawArc(Rect.fromCircle(center: e, radius: 5.2), math.pi * 0.12,
            math.pi * 0.76, false, stroke);
      }
    }

    void brows() {
      stroke.strokeWidth = 3;
      canvas.drawLine(Offset(eL.dx - 5, eL.dy - 8), Offset(eL.dx + 5, eL.dy - 9), stroke);
      canvas.drawLine(Offset(eR.dx - 5, eR.dy - 9), Offset(eR.dx + 5, eR.dy - 8), stroke);
    }

    void smile(bool big) {
      stroke.strokeWidth = 2.8;
      canvas.drawArc(Rect.fromCircle(center: const Offset(-2, -20), radius: big ? 6.5 : 5),
          math.pi * 0.12, math.pi * 0.76, false, stroke);
      if (big) {
        p.color = _c(0x7C3B2A);
        canvas.drawOval(Rect.fromCenter(center: const Offset(-2, -14.5), width: 6, height: 4), p);
      }
    }

    void cheeks() {
      p.color = _c(0xFF9D6A, 0.32);
      canvas.drawCircle(const Offset(-19, -21), 4.5, p);
      canvas.drawCircle(const Offset(15, -21), 4.5, p);
    }

    // Nahla never goes sad — rewards partner only (sad/thinking map to idle)
    switch (expression) {
      case MascotExpression.celebrating:
        brows();
        happyEyes();
        smile(true);
        cheeks();
      case MascotExpression.happy:
        brows();
        happyEyes();
        smile(false);
        cheeks();
      default:
        brows();
        if (blink.value) {
          closedEyes();
        } else {
          openEyes(5.4);
        }
        smile(false);
    }
  }

  /// The signature glowing XP hexagon, popped up with a spring.
  void _coin(Canvas canvas) {
    canvas.save();
    canvas.translate(0, 6);
    final k = 0.4 + 0.6 * Curves.easeOutBack.transform(pop.value);
    canvas.scale(k);
    final p = Paint()..isAntiAlias = true;
    void hex(double r, Color col) {
      final path = Path();
      for (var i = 0; i < 6; i++) {
        final a = -math.pi / 2 + i * math.pi / 3;
        final pt = Offset(math.cos(a) * r, math.sin(a) * r);
        i == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
      }
      path.close();
      p.color = col;
      canvas.drawPath(path, p);
    }

    hex(17, xpGoldDark);
    hex(14.6, xpGold);
    hex(11, xpGoldLight.withValues(alpha: 0.9));
    final stroke = Paint()
      ..isAntiAlias = true
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2.6
      ..color = xpGoldDark;
    // X
    canvas.drawLine(const Offset(-8, -5), const Offset(-2, 5), stroke);
    canvas.drawLine(const Offset(-2, -5), const Offset(-8, 5), stroke);
    // P
    canvas.drawLine(const Offset(2, 5), const Offset(2, -5), stroke);
    canvas.drawArc(Rect.fromCircle(center: const Offset(4, -2.6), radius: 3), -math.pi / 2,
        math.pi, false, stroke);
    canvas.restore();
  }

  void _sparkles(Canvas canvas, double phase) {
    const spots = [
      Offset(-26, -2),
      Offset(-30, 12),
      Offset(-24, 24),
      Offset(22, -4),
      Offset(28, 14),
    ];
    final p = Paint()..isAntiAlias = true;
    for (var i = 0; i < spots.length; i++) {
      final c = spots[i];
      final tw = 0.5 + 0.5 * math.sin(phase * 2 * math.pi + i * 1.3);
      p.color = sparkle.withValues(alpha: 0.5 + 0.5 * tw);
      final r = 1.6 + 2.2 * tw;
      _tri(canvas, p, c + Offset(0, -r), c + Offset(-r * 0.4, 0), c + Offset(r * 0.4, 0));
      _tri(canvas, p, c + Offset(0, r), c + Offset(-r * 0.4, 0), c + Offset(r * 0.4, 0));
      _tri(canvas, p, c + Offset(-r, 0), c + Offset(0, -r * 0.4), c + Offset(0, r * 0.4));
      _tri(canvas, p, c + Offset(r, 0), c + Offset(0, -r * 0.4), c + Offset(0, r * 0.4));
    }
  }

  @override
  bool shouldRepaint(_NahlaPainter old) =>
      old.expression != expression || old.accent != accent || old.showXp != showXp;
}
