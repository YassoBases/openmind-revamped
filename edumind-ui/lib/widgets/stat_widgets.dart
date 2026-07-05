import 'package:flutter/material.dart';
import '../core/palette.dart';

/// Rounded card for the dark game-composer surfaces. (The gamification stat
/// widgets that used to live here — streak/goal/xp/league — were unused and
/// were removed; reintroduce from git history if the stats UI is built.)
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
