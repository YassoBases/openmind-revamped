import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/palette.dart';
import '../../widgets/mascot.dart';

/// The accomplishment moment after every stage: XP counts up, stars reveal
/// one by one, and the child learns their world just grew. ONE next action
/// (back to the map, where the unlock animation plays). Warm, brief, honest —
/// celebration without noise, per the supportive doctrine.
class StageRewardScreen extends StatefulWidget {
  const StageRewardScreen({
    super.key,
    required this.stars,
    required this.xpAwarded,
    this.streakCount,
    this.feedbackHeadline,
    this.worldFinished = false,
  });

  final int stars;
  final int xpAwarded;
  final int? streakCount;
  final String? feedbackHeadline;
  final bool worldFinished;

  @override
  State<StageRewardScreen> createState() => _StageRewardScreenState();
}

class _StageRewardScreenState extends State<StageRewardScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  late final Animation<int> _xp;
  late final Animation<double> _grow;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600));
    _xp = IntTween(begin: 0, end: widget.xpAwarded).animate(
        CurvedAnimation(parent: _c, curve: const Interval(0.15, 0.7, curve: Curves.easeOut)));
    _grow = CurvedAnimation(parent: _c, curve: const Interval(0.6, 1, curve: Curves.elasticOut));
    _c.forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _star(int i) {
    final threshold = 0.2 + i * 0.18;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final on = i < widget.stars && _c.value >= threshold;
        return AnimatedScale(
          scale: on ? 1 : 0.6,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOutBack,
          child: Icon(
            on ? Icons.star_rounded : Icons.star_border_rounded,
            color: on ? Palette.yellow : Palette.grey,
            size: 56,
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      backgroundColor: Palette.dark,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              const Mascot(expression: MascotExpression.celebrating, size: 120),
              const SizedBox(height: 16),
              Text(
                widget.worldFinished
                    ? l.translate('world_complete')
                    : (widget.feedbackHeadline ?? l.translate('stage_complete')),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Palette.soft,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [for (var i = 0; i < 3; i++) _star(i)],
              ),
              const SizedBox(height: 20),
              AnimatedBuilder(
                animation: _xp,
                builder: (context, _) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 10),
                  decoration: BoxDecoration(
                    color: Palette.card,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Palette.cardBorder),
                  ),
                  child: Text(
                    '+${_xp.value} XP',
                    style: const TextStyle(
                      color: Palette.yellow,
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              ScaleTransition(
                scale: _grow,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.park_rounded, color: Palette.green, size: 26),
                    const SizedBox(width: 8),
                    Text(
                      l.translate('world_grew'),
                      style: const TextStyle(
                        color: Palette.grey,
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              if ((widget.streakCount ?? 0) > 1) ...[
                const SizedBox(height: 10),
                Text(
                  '🔥 ${widget.streakCount}',
                  style: const TextStyle(color: Palette.yellow, fontSize: 17),
                ),
              ],
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Palette.green,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(Palette.radiusButton),
                    ),
                  ),
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(
                    l.translate('stage_continue'),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
