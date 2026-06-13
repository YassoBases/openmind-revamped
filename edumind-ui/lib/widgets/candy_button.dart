import 'package:flutter/material.dart';
import '../core/palette.dart';

/// The ONLY button style anywhere (Flutter twin of GameFeel.candyButton):
/// solid top face, ~5px darker shadow band, presses down 5px on tap.
class CandyButton extends StatefulWidget {
  const CandyButton({
    super.key,
    required this.label,
    required this.onTap,
    this.color = Palette.green,
    this.width,
    this.height = 56,
    this.fontSize = 17,
    this.enabled = true,
    this.icon,
  });

  final String label;
  final VoidCallback? onTap;
  final Color color;
  final double? width;
  final double height;
  final double fontSize;
  final bool enabled;
  final IconData? icon;

  @override
  State<CandyButton> createState() => _CandyButtonState();
}

class _CandyButtonState extends State<CandyButton> {
  bool _pressed = false;
  static const _drop = 5.0;

  Color get _shadow => Color.lerp(widget.color, Colors.black, 0.30)!;

  @override
  Widget build(BuildContext context) {
    final labelColor =
        widget.color.computeLuminance() > 0.55 ? Palette.dark : Colors.white;
    return Opacity(
      opacity: widget.enabled ? 1 : 0.55,
      child: GestureDetector(
        onTapDown: widget.enabled ? (_) => setState(() => _pressed = true) : null,
        onTapCancel: () => setState(() => _pressed = false),
        onTapUp: widget.enabled
            ? (_) {
                setState(() => _pressed = false);
                widget.onTap?.call();
              }
            : null,
        child: SizedBox(
          width: widget.width,
          height: widget.height + _drop,
          child: Stack(
            children: [
              Positioned(
                left: 0,
                right: 0,
                top: _drop,
                height: widget.height,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: _shadow,
                    borderRadius: BorderRadius.circular(Palette.radiusButton),
                  ),
                ),
              ),
              AnimatedPositioned(
                duration: const Duration(milliseconds: 60),
                left: 0,
                right: 0,
                top: _pressed ? _drop : 0,
                height: widget.height,
                child: Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: widget.color,
                    borderRadius: BorderRadius.circular(Palette.radiusButton),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.icon != null) ...[
                        Icon(widget.icon, color: labelColor, size: widget.fontSize + 4),
                        const SizedBox(width: 8),
                      ],
                      Flexible(
                        child: Text(
                          widget.label,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: labelColor,
                            fontSize: widget.fontSize,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                    ],
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
