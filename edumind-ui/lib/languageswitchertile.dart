import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'language_provider.dart';
import 'app_localizations.dart';

class LanguageSwitcherTile extends StatelessWidget {
  const LanguageSwitcherTile({super.key});

  @override
  Widget build(BuildContext context) {
    final languageProvider = Provider.of<LanguageProvider>(context);
    final isArabic = languageProvider.currentLocale.languageCode == 'ar';
    final primaryColor = Theme.of(context).colorScheme.primary;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // 1. لف هذا الجزء بـ Expanded لمنع النص من دفع الأزرار خارج الشاشة 🌟
          Expanded(
            child: Row(
              children: [
                Icon(Icons.language, color: primaryColor, size: 24),
                const SizedBox(width: 8),
                // لف النص بـ Flexible لتأكيد نزوله لسطر جديد إذا كانت الشاشة صغيرة جداً
                Flexible(
                  child: Text(
                    AppLocalizations.of(context)!.translate('language'),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                    overflow: TextOverflow
                        .ellipsis, // يضع نقاط ... إذا ضاقت المساحة تماماً
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 8), // مسافة أمان أفقية ثابتة
          // 2. أزرار التبديل التفاعلية
          Container(
            decoration: BoxDecoration(
              color: Theme.of(
                context,
              ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(15),
            ),
            padding: const EdgeInsets.all(4),
            child: Row(
              mainAxisSize:
                  MainAxisSize.min, // لجعل الصف يأخذ أقل مساحة ممكنة للأزرار
              children: [
                _buildLanguageButton(
                  context: context,
                  label: 'العربية',
                  flag: '🇸🇦',
                  isSelected: isArabic,
                  onTap: () => languageProvider.changeLanguage('ar'),
                ),
                const SizedBox(width: 4),
                _buildLanguageButton(
                  context: context,
                  label:
                      'En', // اختصار الاسم لـ En بدلاً من English ليوفر مساحة ممتازة للأطفال والشاشات الصغيرة
                  flag: '🇬🇧',
                  isSelected: !isArabic,
                  onTap: () => languageProvider.changeLanguage('en'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLanguageButton({
    required BuildContext context,
    required String label,
    required String flag,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(
          horizontal: 10,
          vertical: 6,
        ), // تقليل الحشو الداخلي قليلاً لتوفير مساحة
        decoration: BoxDecoration(
          color: isSelected
              ? Theme.of(context).colorScheme.secondary
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Text(flag, style: const TextStyle(fontSize: 14)),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w900,
                color: isSelected
                    ? Colors.white
                    : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
