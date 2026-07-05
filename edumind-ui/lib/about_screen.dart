import 'package:flutter/material.dart';
import 'app_localizations.dart';
import 'core/app_theme.dart';
import 'widgets/pressable_scale.dart'; // تأكد من استيراد الوجيهة التفاعلية الخاصة بك

class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _logoController;
  late final Animation<double> _logoScale;

  @override
  void initState() {
    super.initState();
    // حركة نبض مستمرة وآمنة لشعار التطبيق في الأعلى
    _logoController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _logoScale = Tween<double>(begin: 1.0, end: 1.06).animate(
      CurvedAnimation(parent: _logoController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _logoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final cs = t.colorScheme;
    final l = AppLocalizations.of(context)!;

    return Directionality(
      textDirection: Directionality.of(context), // دعم كامل للغة العربية
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            l.translate('about_appbar'),
            style: const TextStyle(fontWeight: FontWeight.normal),
          ),
          //   centerTitle: true,
          elevation: 0,
          backgroundColor: cs.secondary,
        ),
        extendBodyBehindAppBar: true,
        body: SafeArea(
          child: Stack(
            children: [
              // الخلفية المتدرجة الذكية والمشعة للتطبيق
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment.topCenter,
                      radius: 1.3,
                      colors: [cs.primary.withValues(alpha: 0.1), cs.surface],
                    ),
                  ),
                ),
              ),
              SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 10),
                    // شعار التطبيق الحركي النابض بالحياة
                    Center(
                      child: ScaleTransition(
                        scale: _logoScale,
                        child: Container(
                          width: 100,
                          height: 100,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [cs.primary, cs.secondary],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: cs.primary.withValues(alpha: 0.3),
                                blurRadius: 20,
                                offset: const Offset(0, 8),
                              ),
                            ],
                          ),
                          child: const Center(
                            child: Text('🧠', style: TextStyle(fontSize: 52)),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // اسم التطبيق بهوية openMind الجديدة
                    Center(
                      child: Text(
                        'openMind',
                        style: t.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: cs.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    // رقم الإصدار بطابع الألعاب
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: cs.surfaceContainerHighest.withValues(
                            alpha: 0.6,
                          ),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color: cs.outlineVariant.withValues(alpha: 0.5),
                          ),
                        ),
                        child: Text(
                          l.translate('about_version'),
                          style: t.textTheme.labelMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: cs.primary,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),

                    // === قسم: لماذا openMind؟ ===
                    Text(
                      l.translate('about_why_title'),
                      style: t.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: cs.onSurface,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      decoration: BoxDecoration(
                        color: cs.surface,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(
                          color: cs.primary.withValues(alpha: 0.15),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: cs.shadow.withValues(alpha: 0.04),
                            blurRadius: 16,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Text(
                        l.translate('about_why_body'),
                        style: t.textTheme.bodyLarge?.copyWith(
                          height: 1.6,
                          fontWeight: FontWeight.w700,
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // === قسم: رؤيتنا ===
                    Text(
                      l.translate('about_vision_title'),
                      style: t.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: cs.onSurface,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      decoration: BoxDecoration(
                        color: cs.surface,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(
                          color: cs.secondary.withValues(alpha: 0.15),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: cs.shadow.withValues(alpha: 0.04),
                            blurRadius: 16,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Text(
                        l.translate('about_vision_body'),
                        style: t.textTheme.bodyLarge?.copyWith(
                          height: 1.6,
                          fontWeight: FontWeight.w700,
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // === قسم: ماذا يفعل openMind؟ ===
                    Text(
                      l.translate('about_what_title'),
                      style: t.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: cs.onSurface,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // ميزة 1
                    _buildFeatureCard(
                      context,
                      emoji: '🎮',
                      title: l.translate('about_feat1_title'),
                      description: l.translate('about_feat1_desc'),
                      color: AppColors.blueInk,
                    ),
                    const SizedBox(height: 12),

                    // ميزة 2
                    _buildFeatureCard(
                      context,
                      emoji: '🧠',
                      title: l.translate('about_feat2_title'),
                      description: l.translate('about_feat2_desc'),
                      color: AppColors.mutedGreen,
                    ),
                    const SizedBox(height: 12),

                    // ميزة 3
                    _buildFeatureCard(
                      context,
                      emoji: '🧭',
                      title: l.translate('about_feat3_title'),
                      description: l.translate('about_feat3_desc'),
                      color: AppColors.orange,
                    ),
                    const SizedBox(height: 12),

                    // ميزة 4
                    _buildFeatureCard(
                      context,
                      emoji: '🌍',
                      title: l.translate('about_feat4_title'),
                      description: l.translate('about_feat4_desc'),
                      color: AppColors.blue,
                    ),
                    const SizedBox(height: 12),

                    // ميزة 5
                    _buildFeatureCard(
                      context,
                      emoji: '🤝',
                      title: l.translate('about_feat5_title'),
                      description: l.translate('about_feat5_desc'),
                      color: AppColors.mutedRed,
                    ),

                    // تذييل الصفحة اللطيف
                    Padding(
                      padding: const EdgeInsets.only(top: 30, bottom: 20),
                      child: Center(
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Flexible(
                              child: Text(
                                l.translate('about_footer'),
                                style: const TextStyle(
                                  fontFamily: 'Cairo',
                                  fontSize: 14,
                                  color: AppColors.blueInk,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Image.asset(
                              'assets/images/syrian_flag_new.png',
                              width: 24,
                              height: 24,
                              fit: BoxFit.contain,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // وجيهة لبناء كروت الميزات التفاعلية القابلة للانضغاط عند اللمس
  Widget _buildFeatureCard(
    BuildContext context, {
    required String emoji,
    required String title,
    required String description,
    required Color color,
  }) {
    final t = Theme.of(context);
    final cs = t.colorScheme;

    return PressableScale(
      borderRadius: BorderRadius.circular(22),
      onTap: () {}, // لمسة تفاعلية بدون إجراء لتسلية الطفل داخل الصفحة
      child: Container(
        decoration: BoxDecoration(
          color: cs.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: color.withValues(alpha: 0.2), width: 1.5),
          gradient: LinearGradient(
            colors: [color.withValues(alpha: 0.05), cs.surface],
            begin: AlignmentDirectional.topStart,
            end: AlignmentDirectional.bottomEnd,
          ),
        ),
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Center(
                child: Text(emoji, style: const TextStyle(fontSize: 24)),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: t.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: cs.onSurface,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: t.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: cs.onSurfaceVariant,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
