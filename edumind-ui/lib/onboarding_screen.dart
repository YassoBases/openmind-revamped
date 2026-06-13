import 'package:edumind/languageswitchertile.dart';
import 'package:edumind/profilesetup_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'app_localizations.dart';
import 'widgets/mascot.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final cs = t.colorScheme;

    return Directionality(
      textDirection: Directionality.of(context),

      child: Scaffold(
        body: Stack(
          children: [
            // Positioned.fill(
            //   child: DecoratedBox(
            //     decoration: BoxDecoration(
            //       gradient: LinearGradient(
            //         colors: [
            //           cs.primary.withValues(alpha: 0.12),
            //           cs.primary.withValues(alpha: 0.0),
            //         ],
            //         begin: AlignmentDirectional.topStart,
            //         end: AlignmentDirectional.bottomEnd,
            //       ),
            //     ),
            //   ),
            // ),
            Positioned(
              top: -50,
              right: -50,
              child: _maybeAnimate(
                context,
                Icon(
                  Icons.change_history,
                  size: 200,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
                (child) => child
                    .animate(
                      onPlay: (controller) => controller.repeat(reverse: true),
                    )
                    .moveY(end: 30, duration: 3.seconds),
              ),
            ),
            Positioned(
              bottom: 100,
              left: -20,
              child: _maybeAnimate(
                context,
                Icon(
                  Icons.close,
                  size: 150,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
                (child) => child
                    .animate(onPlay: (controller) => controller.repeat())
                    .rotate(duration: 10.seconds),
              ),
            ),
            SafeArea(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // هنا يمكنك وضع ملف Lottie بدلاً من الأيقونة
                    // Lottie.asset('assets/animations/khwarizmi.json', height: 250),
                    // Container(
                    //   width: 200,
                    //   height: 200,
                    //   decoration: BoxDecoration(
                    //     color: const Color(0xFF3F2B66),
                    //     shape: BoxShape.circle,
                    //     border: Border.all(
                    //       color: const Color(0xFFF1C40F),
                    //       width: 4,
                    //     ),
                    //     boxShadow: [
                    //       BoxShadow(
                    //         color: const Color(0xFFF1C40F).withValues(alpha: 0.5),
                    //         blurRadius: 30,
                    //         spreadRadius: 5,
                    //       ),
                    //     ],
                    //   ),
                    //   child: const Icon(
                    //     Icons.school,
                    //     size: 100,
                    //     color: Color(0xFFF1C40F),
                    //   ),
                    // ).animate().scale(
                    //   duration: 800.ms,
                    //   curve: Curves.easeOutBack,
                    // ),

                    // const SizedBox(height: 40),

                    // // النص الترحيبي مع تأثير الظهور المتدرج
                    // const Text(
                    //   "مرحباً بك في عالم\nالخوارزمي للرياضيات!",
                    //   textAlign: TextAlign.center,
                    //   style: TextStyle(
                    //     fontSize: 28,
                    //     fontWeight: FontWeight.bold,
                    //     color: Color.fromARGB(255, 0, 0, 0),
                    //   ),
                    // ).animate().fade(delay: 500.ms).slideY(begin: 0.5, end: 0),

                    // const SizedBox(height: 15),

                    // const Text(
                    //   "اكتشف متعة الأرقام والهندسة\nفي رحلة تاريخية شيقة",
                    //   textAlign: TextAlign.center,
                    //   style: TextStyle(
                    //     fontSize: 16,
                    //     color: Color.fromARGB(255, 0, 0, 0),
                    //   ),
                    // ).animate().fade(delay: 1000.ms).slideY(begin: 0.5, end: 0),

                    // تأثير النبضان لجذب الانتباه
                    Padding(
                      padding: const EdgeInsets.fromLTRB(22, 18, 22, 22),
                      child: Card(
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                cs.primaryContainer.withValues(alpha: 0.9),
                                cs.surface.withValues(alpha: 0.95),
                              ],
                              begin: AlignmentDirectional.topStart,
                              end: AlignmentDirectional.bottomEnd,
                            ),
                            borderRadius: BorderRadius.circular(24),
                          ),
                          padding: const EdgeInsets.fromLTRB(20, 26, 20, 22),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Container(
                              //   width: 86,
                              //   height: 86,
                              //   decoration: BoxDecoration(
                              //     color: cs.primary,
                              //     borderRadius: BorderRadius.circular(26),
                              //     boxShadow: [
                              //       BoxShadow(
                              //         color: cs.shadow.withValues(alpha: 0.16),
                              //         blurRadius: 18,
                              //         offset: const Offset(0, 10),
                              //       ),
                              //     ],
                              //   ),
                              //   child: const Center(
                              //     child: Text(
                              //       '✨',
                              //       style: TextStyle(fontSize: 34),
                              //     ),
                              //   ),
                              // ),
                              _maybeAnimate(
                                context,
                                const Mascot(
                                  size: 160,
                                  expression: MascotExpression.happy,
                                ),
                                (child) => child.animate().scale(
                                  duration: 800.ms,
                                  curve: Curves.easeOutBack,
                                ),
                              ),
                              const SizedBox(height: 18),
                              // النص الترحيبي مع تأثير الظهور المتدرج
                              _maybeAnimate(
                                context,
                                Text(
                                  AppLocalizations.of(
                                    context,
                                  )!.translate('onb_title'),
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 28,
                                    fontWeight: FontWeight.bold,
                                    color: Color.fromARGB(255, 0, 0, 0),
                                  ),
                                ),
                                (child) => child
                                    .animate()
                                    .fade(delay: 500.ms)
                                    .slideY(begin: 0.5, end: 0),
                              ),

                              const SizedBox(height: 15),

                              _maybeAnimate(
                                context,
                                Text(
                                  AppLocalizations.of(
                                    context,
                                  )!.translate('onb_subtitle'),
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    color: Color.fromARGB(255, 0, 0, 0),
                                  ),
                                ),
                                (child) => child
                                    .animate()
                                    .fade(delay: 1000.ms)
                                    .slideY(begin: 0.5, end: 0),
                              ),

                              // Text(
                              //   'Welcome to EduMind',
                              //   textAlign: TextAlign.center,
                              //   style: t.textTheme.headlineSmall?.copyWith(
                              //     fontWeight: FontWeight.w900,
                              //   ),
                              // ),
                              // const SizedBox(height: 10),
                              // Text(
                              //   'Learn math like a game—short quests, rewards, and friendly help.',
                              //   textAlign: TextAlign.center,
                              //   style: t.textTheme.bodyLarge?.copyWith(
                              //     color: cs.onSurfaceVariant,
                              //     fontWeight: FontWeight.w600,
                              //     height: 1.4,
                              //   ),
                              // ),
                              const SizedBox(height: 18),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: cs.surface.withValues(alpha: 0.7),
                                  borderRadius: BorderRadius.circular(22),
                                  border: Border.all(
                                    color: cs.outlineVariant.withValues(
                                      alpha: 0.6,
                                    ),
                                  ),
                                ),
                                child: LanguageSwitcherTile(),
                              ),
                              const SizedBox(height: 20),
                              _AnimatedCta(
                                onTap: () {
                                  Navigator.pushReplacement<void, void>(
                                    context,
                                    MaterialPageRoute<void>(
                                      builder: (context) =>
                                          const ProfileSetupScreen(),
                                    ),
                                  );
                                },
                              ),
                            ],
                          ),
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
    );
  }
}

Widget _maybeAnimate(
  BuildContext context,
  Widget child,
  Widget Function(Widget child) animate,
) {
  return TickerMode.valuesOf(context).enabled ? animate(child) : child;
}

class _AnimatedCta extends StatefulWidget {
  const _AnimatedCta({required this.onTap});
  final VoidCallback onTap;

  @override
  State<_AnimatedCta> createState() => _AnimatedCtaState();
}

class _AnimatedCtaState extends State<_AnimatedCta> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOut,
        child:
            // // زر "ابدأ الآن" التفاعلي
            // ElevatedButton(
            //       onPressed: () {
            //         // النقل إلى واجهة الخريطة (الواجهة الرئيسية)
            //         widget.onTap;
            //       },
            //       style: ElevatedButton.styleFrom(
            //         backgroundColor: const Color(0xFFF1C40F),
            //         foregroundColor: const Color(0xFF2D1B4E),
            //         padding: const EdgeInsets.symmetric(
            //           horizontal: 50,
            //           vertical: 15,
            //         ),
            //         shape: RoundedRectangleBorder(
            //           borderRadius: BorderRadius.circular(30),
            //         ),
            //         elevation: 10,
            //       ),
            //       child: const Text(
            //         "ابدأ الآن",
            //         style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            //       ),
            //     )
            //     .animate(
            //       onPlay: (controller) => controller.repeat(reverse: true),
            //     )
            //     .scaleXY(end: 1.05, duration: 1.seconds),
            _maybeAnimate(
              context,
              FilledButton(
                onPressed: widget.onTap,
                style: FilledButton.styleFrom(
                  backgroundColor: cs.secondary,
                  foregroundColor: cs.onSecondary,
                  minimumSize: const Size(double.infinity, 58),
                  elevation: 4,
                  shadowColor: cs.shadow.withValues(alpha: 0.26),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(26),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.play_arrow_rounded, size: 26),
                    const SizedBox(width: 10),
                    Text(AppLocalizations.of(context)!.translate('onb_cta')),
                  ],
                ),
              ),
              (child) => child
                  .animate(
                    onPlay: (controller) => controller.repeat(reverse: true),
                  )
                  .scaleXY(end: 1.05, duration: 1.seconds),
            ),
      ),
    );
  }
}
