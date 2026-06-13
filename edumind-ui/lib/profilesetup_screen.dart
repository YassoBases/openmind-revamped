import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_localizations.dart';
import 'theme_selection_screen.dart'; // الواجهة التالية لاختيار السمة

class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final TextEditingController _nameController = TextEditingController();

  // متغيرات الاختيارات
  String? _selectedGender;
  String? _selectedClass;
  int? _selectedLearningStyle;
  final List<int> _selectedInterests = [];

  // قائمة الصفوف الدراسية
  final List<String> _classes = ['خامس', 'سادس', 'سابع', 'ثامن'];

  // Interests — icon + localization key (index is what gets stored/mapped).
  final List<Map<String, String>> _interests = const [
    {'icon': '🎮', 'key': 'int_games'},
    {'icon': '⚽', 'key': 'int_sports'},
    {'icon': '🎨', 'key': 'int_art'},
    {'icon': '🔬', 'key': 'int_science'},
    {'icon': '🏗️', 'key': 'int_building'},
    {'icon': '⚡', 'key': 'int_nature'},
    {'icon': '🤝', 'key': 'int_helping'},
    {'icon': '🧩', 'key': 'int_puzzles'},
    {'icon': '📚', 'key': 'int_reading'},
  ];

  // Learning styles — icon + localization keys.
  final List<Map<String, String>> _learningStyles = const [
    {'icon': '🪜', 'titleKey': 'style_step_title', 'descKey': 'style_step_desc'},
    {'icon': '⚡', 'titleKey': 'style_try_title', 'descKey': 'style_try_desc'},
    {'icon': '📖', 'titleKey': 'style_story_title', 'descKey': 'style_story_desc'},
  ];

  // EduMind grade label → localization key for display.
  static const _classKey = {
    'خامس': 'grade_5', 'سادس': 'grade_6', 'سابع': 'grade_7', 'ثامن': 'grade_8',
  };

  // الألوان المعتمدة للتطبيق
  final Color _primaryColor = const Color(0xFF6A1B9A); // البنفسجي الحديث
  final Color _accentColor = const Color(0xFFFF9800); // البرتقالي المتوهج
  final Color _backgroundColor = const Color(0xFFF8F9FD); // خلفية ناعمة وحديثة
  final Color _textDarkColor = const Color(0xFF1A1A2E);

  // تعريف الخط الموحد بدقة بناءً على طلبك
  final String _fontFamily = 'Tajawal';
  final String _numberFont = 'Plus Jakarta Sans';

  // تدرج لوني عام مدمج بين البرتقالي والبنفسجي للحواف والأزرار
  Gradient get _primaryGradient => LinearGradient(
    colors: [_accentColor, _primaryColor],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );

  // تدرج لوني فاتح جداً لعناصر النقر والاختيار
  Gradient get _lightSelectedGradient => LinearGradient(
    colors: [_accentColor.withValues(alpha: 0.12), _primaryColor.withValues(alpha: 0.12)],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );

  @override
  void initState() {
    super.initState();
    _loadSavedProfileData();
    _nameController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  // دالة تحميل البيانات الدائمة من ذاكرة الجهاز (SharedPreferences)
  Future<void> _loadSavedProfileData() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _nameController.text = prefs.getString('user_name') ?? '';
      _selectedGender = prefs.getString('user_gender');
      _selectedClass = prefs.getString('user_class');
      _selectedLearningStyle = prefs.getInt('user_learning_style');

      List<String>? savedInterests = prefs.getStringList('user_interests');
      if (savedInterests != null) {
        _selectedInterests.clear();
        for (var indexStr in savedInterests) {
          _selectedInterests.add(int.parse(indexStr));
        }
      }
    });
  }

  // Persist the collected answers locally (all fields optional — the engine
  // applies sensible defaults for anything left blank).
  Future<void> _saveProfileData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_name', _nameController.text.trim());
    if (_selectedGender != null) await prefs.setString('user_gender', _selectedGender!);
    if (_selectedClass != null) await prefs.setString('user_class', _selectedClass!);
    if (_selectedLearningStyle != null) {
      await prefs.setInt('user_learning_style', _selectedLearningStyle!);
    }
    await prefs.setStringList(
        'user_interests', _selectedInterests.map((e) => e.toString()).toList());
  }

  void _toggleInterest(int index) {
    setState(() {
      if (_selectedInterests.contains(index)) {
        _selectedInterests.remove(index);
      } else {
        if (_selectedInterests.length < 2) {
          _selectedInterests.add(index);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              backgroundColor: _primaryColor,
              content: Text(
                AppLocalizations.of(context)!.translate('ps_max_interests'),
                style: TextStyle(
                  fontFamily: _fontFamily,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          );
        }
      }
    });
  }

  // ودجت مخصص لعنونة الفقرات بلمسة متدرجة واضحة ومحددة
  Widget _buildSectionHeader(String title, String subtitle, IconData icon) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ShaderMask(
          shaderCallback: (bounds) => _primaryGradient.createShader(bounds),
          child: Icon(icon, color: Colors.white, size: 28),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontFamily: _fontFamily,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                  color: _textDarkColor,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: TextStyle(
                  fontFamily: _fontFamily,
                  fontSize: 13,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;

    return Directionality(
      textDirection: Directionality.of(context),
      child: Scaffold(
        backgroundColor: _backgroundColor,
        appBar: AppBar(
          backgroundColor: _accentColor, // شريط علوي باللون البرتقالي المطلق
          elevation: 0,
          title: Text(
            l.translate('ps_appbar'),
            style: TextStyle(
              fontFamily: _fontFamily,
              fontWeight: FontWeight.bold,
              fontSize: 20,
              color: Colors.white,
            ),
          ),
          // centerTitle: true,
          // bottom: PreferredSize(
          //   preferredSize: const Size.fromHeight(4.0),
          //   child: Container(
          //     height: 4.0,
          //     decoration: BoxDecoration(
          //       gradient:
          //           _primaryGradient, // خط متدرج أسفل حافة الـ AppBar للربط البصري
          //     ),
          //   ),
          // ),
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l.translate('ps_sub'),
                style: TextStyle(
                  fontFamily: _fontFamily,
                  fontSize: 14,
                  color: Colors.grey[700],
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 20),

              // ================== أولاً: قسم المعلومات الأساسية ==================
              Card(
                elevation: 0,
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                  //side: BorderSide(color: Colors.grey[300]!, width: 1.5),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildSectionHeader(
                        l.translate('ps_basic'),
                        l.translate('ps_basic_sub'),
                        Icons.badge_outlined,
                      ),
                      const SizedBox(height: 25),

                      // حقل إدخال الاسم
                      Text(
                        l.translate('ps_name_label'),
                        style: TextStyle(
                          fontFamily: _fontFamily,
                          fontWeight: FontWeight.bold,
                          color: _textDarkColor,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _nameController,
                        style: TextStyle(fontFamily: _fontFamily, fontSize: 15),
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: Colors.grey[50],
                          hintText: l.translate('ps_name_hint2'),
                          hintStyle: TextStyle(
                            fontFamily: _fontFamily,
                            color: Colors.grey[400],
                            fontSize: 14,
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(
                              color: Colors.grey[300]!,
                              width: 1.5,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(
                              color: _accentColor,
                              width: 2.0,
                            ),
                          ),
                          prefixIcon: ShaderMask(
                            shaderCallback: (bounds) =>
                                _primaryGradient.createShader(bounds),
                            child: Icon(
                              Icons.alternate_email_rounded,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),

                      // حقل تحديد الجنس
                      Text(
                        l.translate('ps_gender_q'),
                        style: TextStyle(
                          fontFamily: _fontFamily,
                          fontWeight: FontWeight.bold,
                          color: _textDarkColor,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: _buildGenderCard(
                              label: l.translate('ps_male'),
                              icon: Icons.male_rounded,
                              isSelected: _selectedGender == 'ذكر',
                              onTap: () =>
                                  setState(() => _selectedGender = 'ذكر'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _buildGenderCard(
                              label: l.translate('ps_female'),
                              icon: Icons.female_rounded,
                              isSelected: _selectedGender == 'أنثى',
                              onTap: () =>
                                  setState(() => _selectedGender = 'أنثى'),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      // حقل تحديد الصف الدراسي
                      Text(
                        l.translate('ps_class_label'),
                        style: TextStyle(
                          fontFamily: _fontFamily,
                          fontWeight: FontWeight.bold,
                          color: _textDarkColor,
                        ),
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        initialValue: _selectedClass,
                        style: TextStyle(
                          fontFamily: _fontFamily,
                          color: _textDarkColor,
                          fontSize: 15,
                        ),
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: Colors.grey[50],
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(
                              color: Colors.grey[300]!,
                              width: 1.5,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide(
                              color: _primaryColor,
                              width: 2.0,
                            ),
                          ),
                          prefixIcon: ShaderMask(
                            shaderCallback: (bounds) =>
                                _primaryGradient.createShader(bounds),
                            child: Icon(
                              Icons.school_rounded,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        hint: Text(
                          l.translate('ps_class_hint2'),
                          style: TextStyle(
                            fontFamily: _fontFamily,
                            color: Colors.grey[500],
                          ),
                        ),
                        items: _classes
                            .map(
                              (c) => DropdownMenuItem(
                                value: c,
                                child: Text(
                                  l.translate(_classKey[c] ?? 'grade_5'),
                                  style: TextStyle(fontFamily: _fontFamily),
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (val) =>
                            setState(() => _selectedClass = val),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // ================== ثانياً: قسم الاهتمامات ==================
              Card(
                elevation: 0,
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                  //  side: BorderSide(color: Colors.grey[300]!, width: 1.5),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildSectionHeader(
                        l.translate('ps_interests_sec'),
                        l.translate('ps_interests_sub'),
                        Icons.rocket_launch_outlined,
                      ),
                      const SizedBox(height: 20),
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              childAspectRatio: 2.3,
                              crossAxisSpacing: 10,
                              mainAxisSpacing: 10,
                            ),
                        itemCount: _interests.length,
                        itemBuilder: (context, index) {
                          final isSelected = _selectedInterests.contains(index);
                          return InkWell(
                            onTap: () => _toggleInterest(index),
                            borderRadius: BorderRadius.circular(16),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              decoration: BoxDecoration(
                                gradient: isSelected
                                    ? _lightSelectedGradient
                                    : null,
                                color: isSelected ? null : Colors.white,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: isSelected
                                      ? _accentColor
                                      : Colors.grey[300]!,
                                  width: isSelected ? 1.5 : 1.5,
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    _interests[index]['icon']!,
                                    style: const TextStyle(fontSize: 22),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    l.translate(_interests[index]['key']!),
                                    style: TextStyle(
                                      fontFamily: _fontFamily,
                                      fontWeight: isSelected
                                          ? FontWeight.bold
                                          : FontWeight.w500,
                                      color: isSelected
                                          ? _accentColor
                                          : _textDarkColor,
                                      fontSize: 13.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // ================== ثالثاً: قسم طريقة التعلم ==================
              Card(
                elevation: 0,
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                  // side: BorderSide(color: Colors.grey[300]!, width: 1.5),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildSectionHeader(
                        l.translate('ps_style_sec'),
                        l.translate('ps_style_sub'),
                        Icons.psychology_outlined,
                      ),
                      const SizedBox(height: 12),
                      ListView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _learningStyles.length,
                        itemBuilder: (context, index) {
                          final isSelected = _selectedLearningStyle == index;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: InkWell(
                              onTap: () => setState(
                                () => _selectedLearningStyle = index,
                              ),
                              borderRadius: BorderRadius.circular(16),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  gradient: isSelected
                                      ? _lightSelectedGradient
                                      : null,
                                  color: isSelected ? null : Colors.white,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: isSelected
                                        ? _primaryColor
                                        : Colors.grey[300]!,
                                    width: isSelected ? 2.0 : 1.5,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 35,
                                      height: 35,
                                      decoration: BoxDecoration(
                                        gradient: isSelected
                                            ? _primaryGradient
                                            : null,
                                        color: isSelected
                                            ? null
                                            : Colors.grey[300],
                                        shape: BoxShape.circle,
                                      ),
                                      child: Center(
                                        child: Text(
                                          '${index + 1}',
                                          style: TextStyle(
                                            fontFamily: _numberFont,
                                            fontWeight: FontWeight.bold,
                                            color: isSelected
                                                ? Colors.white
                                                : Colors.grey[700],
                                            fontSize: 15,
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            l.translate(_learningStyles[index]['titleKey']!),
                                            style: TextStyle(
                                              fontFamily: _fontFamily,
                                              fontSize: 15,
                                              fontWeight: FontWeight.bold,
                                              color: isSelected
                                                  ? _primaryColor
                                                  : _textDarkColor,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            l.translate(_learningStyles[index]['descKey']!),
                                            style: TextStyle(
                                              fontFamily: _fontFamily,
                                              fontSize: 12,
                                              color: Colors.grey[600],
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Text(
                                      _learningStyles[index]['icon']!,
                                      style: const TextStyle(fontSize: 26),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 35),

              // ================== زر تابع السادة (بدون تدرج) ==================
              Center(
                child: Container(
                  width: double.infinity,
                  height: 55,
                  decoration: BoxDecoration(
                    color: _accentColor, // تم استبدال التدرج بلون برتقالي سادة
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [
                      BoxShadow(
                        color: _accentColor.withValues(alpha: 0.3),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  child: ElevatedButton(
                    onPressed: () async {
                      await _saveProfileData();
                      if (!context.mounted) return;
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const ThemeSelectionScreen(),
                        ),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors
                          .transparent, // نتركه شفافاً ليظهر لون الحاوية (Container) بالأسفل
                      shadowColor: Colors.transparent,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                    child: Text(
                      l.translate('ps_continue'),
                      style: TextStyle(
                        fontFamily: _fontFamily,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 15),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGenderCard({
    required String label,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          gradient: isSelected ? _lightSelectedGradient : null,
          color: isSelected ? null : Colors.white,
          borderRadius: BorderRadius.circular(16),
          // هنا تم دمج الحدود مع الخلفية المتدرجة للحصول على تطابق 100%
          border: Border.all(
            color: isSelected
                ? _primaryColor.withValues(alpha: 0.7)
                : Colors.grey[300]!,
            width: 1.5,
          ),
        ),
        child: Row(
          mainAxisAlignment:
              MainAxisAlignment.center, // محاذاة سنتر للطرفين بالتساوي
          children: [
            Icon(
              isSelected ? icon : Icons.radio_button_off,
              color: isSelected ? _primaryColor : Colors.grey[500],
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontFamily: _fontFamily,
                fontWeight: FontWeight.bold,
                fontSize: 15,
                color: isSelected ? _primaryColor : _textDarkColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
