import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../core/palette.dart';

/// Streak flame with day count.
class StreakFlame extends StatelessWidget {
  const StreakFlame({super.key, required this.count, this.size = 28});
  final int count;
  final double size;

  @override
  Widget build(BuildContext context) {
    final lit = count > 0;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Text('🔥', style: TextStyle(fontSize: size, color: lit ? null : Palette.grey)),
      const SizedBox(width: 4),
      Text('$count',
          style: TextStyle(
            fontSize: size * 0.8,
            fontWeight: FontWeight.w800,
            color: lit ? Palette.yellow : Palette.grey,
          )),
    ]);
  }
}

/// Daily goal ring (n of dailyGoal games today).
class GoalRing extends StatelessWidget {
  const GoalRing({super.key, required this.done, required this.goal, this.size = 64, this.accent = Palette.green});
  final int done;
  final int goal;
  final double size;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final progress = goal == 0 ? 0.0 : (done / goal).clamp(0.0, 1.0);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(alignment: Alignment.center, children: [
        SizedBox(
          width: size,
          height: size,
          child: CustomPaint(painter: _RingPainter(progress, accent)),
        ),
        progress >= 1.0
            ? const Text('🎉', style: TextStyle(fontSize: 20))
            : Text('$done/$goal',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Palette.soft)),
      ]),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.progress, this.accent);
  final double progress;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final stroke = size.width * 0.12;
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    p.color = Palette.cardBorder;
    canvas.drawArc(rect.deflate(stroke / 2), 0, math.pi * 2, false, p);
    p.color = accent;
    canvas.drawArc(rect.deflate(stroke / 2), -math.pi / 2, math.pi * 2 * progress, false, p);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.progress != progress || old.accent != accent;
}

/// XP progress bar toward the next league.
class XpBar extends StatelessWidget {
  const XpBar({super.key, required this.xp});
  final int xp;

  @override
  Widget build(BuildContext context) {
    final (target, label) = xp >= 2000 ? (xp, '🏆') : (xp >= 500 ? (2000, '🥇') : (500, '🥈'));
    final progress = target == 0 ? 1.0 : (xp / target).clamp(0.0, 1.0);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('⚡ $xp XP',
            style: const TextStyle(fontWeight: FontWeight.w800, color: Palette.yellow, fontSize: 16)),
        Text('$label ${target > xp ? target : ''}',
            style: const TextStyle(color: Palette.grey, fontSize: 13)),
      ]),
      const SizedBox(height: 6),
      ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: LinearProgressIndicator(
          value: progress,
          minHeight: 12,
          backgroundColor: Palette.cardBorder,
          valueColor: const AlwaysStoppedAnimation(Palette.yellow),
        ),
      ),
    ]);
  }
}

/// League badge for the profile screen.
class LeagueBadge extends StatelessWidget {
  const LeagueBadge({super.key, required this.league});
  final String league; // bronze | silver | gold

  @override
  Widget build(BuildContext context) {
    final (emoji, color, label) = switch (league) {
      'gold' => ('🥇', Palette.yellow, tr(context, 'gold')),
      'silver' => ('🥈', Palette.grey, tr(context, 'silver')),
      _ => ('🥉', Color(0xFFCD7F32), tr(context, 'bronze')),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color, width: 2),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(emoji, style: const TextStyle(fontSize: 22)),
        const SizedBox(width: 8),
        Text('$label ${tr(context, 'league')}',
            style: TextStyle(fontWeight: FontWeight.w800, color: color)),
      ]),
    );
  }
}

/// Rounded EduMind card.
class EduCard extends StatelessWidget {
  const EduCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(16), this.color = Palette.card});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(Palette.radiusCard),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Palette.radiusCard),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(Palette.radiusCard),
            border: Border.all(color: Palette.cardBorder, width: 1.5),
          ),
          child: child,
        ),
      ),
    );
  }
}
