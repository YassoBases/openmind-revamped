import 'package:flutter/material.dart';

/// The dark "game studio" palette — the composer and game player deliberately
/// keep a bright-on-dark Duolingo register, distinct from the warm app system
/// in core/app_theme.dart (AppColors). Everything OUTSIDE the game-creation and
/// game-player flows should use AppColors / the theme, not these constants.
/// Also still the home of hexToColor/colorToHex and the game/emoji constants.
class Palette {
  static const green = Color(0xFF58CC02);
  static const greenShadow = Color(0xFF46A302);
  static const blue = Color(0xFF1CB0F6);
  static const blueShadow = Color(0xFF1899D6);
  static const yellow = Color(0xFFFFC800);
  static const heart = Color(0xFFFF4B4B);
  static const purple = Color(0xFFCE82FF);
  static const dark = Color(0xFF131F24);
  static const card = Color(0xFF1F2F38);
  static const cardBorder = Color(0xFF2E4452);
  static const soft = Color(0xFFF7F7F7);
  static const grey = Color(0xFFAFAFAF);

  /// radii: card 24, button 16, input 20, pill 999 — no sharp rectangles
  static const radiusCard = 24.0;
  static const radiusButton = 16.0;
  static const radiusInput = 20.0;
}

/// Show the offline Demo Games section. On by default (handy for testing and
/// demos); ship production with --dart-define=SHOW_DEMOS=false to hide it.
const kShowDemos = bool.fromEnvironment('SHOW_DEMOS', defaultValue: true);

const kGameTypes = ['quest_path', 'goal_shootout', 'draw_connect'];

const kThemesByGame = {
  'quest_path': ['fantasy', 'sci_fi', 'detective', 'anime'],
  'goal_shootout': ['football', 'basketball', 'hockey', 'archery'],
  'draw_connect': ['blueprint', 'notebook', 'whiteboard', 'chalkboard'],
};

const kInterests = [
  'dinosaurs', 'space', 'football', 'cats', 'robots',
  'ocean', 'cars', 'royalty', 'art', 'music',
];

const kInterestEmoji = {
  'dinosaurs': '🦖', 'space': '🚀', 'football': '⚽', 'cats': '🐱',
  'robots': '🤖', 'ocean': '🐠', 'cars': '🏎️', 'royalty': '👑',
  'art': '🎨', 'music': '🎵',
};

const kGameTypeEmoji = {
  'quest_path': '🗺️', 'goal_shootout': '🥅', 'draw_connect': '✏️',
};

const kThemeEmoji = {
  'fantasy': '🏰', 'sci_fi': '🛸', 'detective': '🕵️', 'anime': '🌸',
  'football': '⚽', 'basketball': '🏀', 'hockey': '🏒', 'archery': '🏹',
  'blueprint': '📐', 'notebook': '📓', 'whiteboard': '🖊️', 'chalkboard': '🧑‍🏫',
};

const kColorChoices = [
  Color(0xFF58CC02), Color(0xFF1CB0F6), Color(0xFFFFC800), Color(0xFFCE82FF),
  Color(0xFFFF6F61), Color(0xFF00C2A8), Color(0xFFFF8FB3), Color(0xFFFFA94D),
  Color(0xFF1C1C1E),
];

String colorToHex(Color c) {
  final argb = c.toARGB32();
  return '#${(argb & 0xFFFFFF).toRadixString(16).padLeft(6, '0').toUpperCase()}';
}

Color hexToColor(String hex) =>
    Color(0xFF000000 | int.parse(hex.replaceFirst('#', ''), radix: 16));

/// A readable foreground for text/icons placed on a solid [accent] fill —
/// white on darker accents, ink on lighter ones (e.g. pink). Same threshold
/// as widgets/candy_button.dart so filled surfaces read consistently.
Color onAccentColor(Color accent) =>
    accent.computeLuminance() > 0.55 ? Palette.dark : Colors.white;

/// Tiny string table — EN/AR for every UI string in the app.
const Map<String, Map<String, String>> _strings = {
  'appName': {'en': 'OpenMind', 'ar': 'أوبن مايند'},
  'letsGo': {'en': "LET'S GO", 'ar': 'هيا بنا'},
  'next': {'en': 'NEXT', 'ar': 'التالي'},
  'back': {'en': 'Back', 'ar': 'رجوع'},
  'welcome1': {'en': "Hi! I'm Hudhud the hoopoe. What should I call you?", 'ar': 'أهلًا! أنا الهدهد هدهد. ماذا أناديك؟'},
  'nickname': {'en': 'Nickname', 'ar': 'الاسم المستعار'},
  'gradeQ': {'en': 'Which grade are you in?', 'ar': 'في أي صف أنت؟'},
  'grade': {'en': 'Grade', 'ar': 'الصف'},
  'genderQ': {'en': 'How should Arabic address you? (optional)', 'ar': 'كيف تحب أن نخاطبك بالعربية؟ (اختياري)'},
  'genderM': {'en': 'He / هو', 'ar': 'مذكّر'},
  'genderF': {'en': 'She / هي', 'ar': 'مؤنّث'},
  'genderSkip': {'en': 'Skip', 'ar': 'تخطي'},
  'languageQ': {'en': 'Which language do you learn in?', 'ar': 'بأي لغة تتعلم؟'},
  'colorQ': {'en': 'Pick your color — it follows you everywhere!', 'ar': 'اختر لونك — سيرافقك في كل مكان!'},
  'interestQ': {'en': 'What do you love? Your companion comes from this.', 'ar': 'ما الذي تحبه؟ رفيقك في اللعب يأتي من هنا.'},
  'goalQ': {'en': 'Daily goal: how many games a day?', 'ar': 'هدفك اليومي: كم لعبة في اليوم؟'},
  'startAdventure': {'en': 'START MY ADVENTURE', 'ar': 'ابدأ مغامرتي'},
  'dashboard': {'en': 'Home', 'ar': 'الرئيسية'},
  'library': {'en': 'Library', 'ar': 'مكتبتي'},
  'profile': {'en': 'Profile', 'ar': 'ملفي'},
  'createGame': {'en': 'NEW GAME', 'ar': 'لعبة جديدة'},
  'subject': {'en': 'Subject', 'ar': 'المادة'},
  'topic': {'en': 'What do you want to learn?', 'ar': 'ماذا تريد أن تتعلم؟'},
  'topicHint': {'en': 'e.g. Dinosaurs, The Water Cycle, Times Tables…', 'ar': 'مثال: الديناصورات، دورة الماء، جدول الضرب…'},
  'gameType': {'en': 'Game', 'ar': 'اللعبة'},
  'theme': {'en': 'Theme', 'ar': 'الطابع'},
  'sessionLength': {'en': 'Length', 'ar': 'المدة'},
  'difficulty': {'en': 'Difficulty', 'ar': 'الصعوبة'},
  'short': {'en': 'Short', 'ar': 'قصيرة'},
  'medium': {'en': 'Medium', 'ar': 'متوسطة'},
  'long': {'en': 'Long', 'ar': 'طويلة'},
  'easy': {'en': 'Easy', 'ar': 'سهلة'},
  'normal': {'en': 'Normal', 'ar': 'عادية'},
  'hard': {'en': 'Hard', 'ar': 'صعبة'},
  'generate': {'en': 'CREATE MY GAME', 'ar': 'أنشئ لعبتي'},
  'review': {'en': 'Daily Review', 'ar': 'مراجعة اليوم'},
  'reviewSub': {'en': 'Beat the questions that beat you', 'ar': 'تغلّب على الأسئلة التي هزمتك'},
  'demoGames': {'en': 'Demo Games', 'ar': 'ألعاب تجريبية'},
  'demoSub': {'en': 'Offline — no account, no internet', 'ar': 'دون إنترنت — بلا حساب'},
  'settings': {'en': 'Settings', 'ar': 'الإعدادات'},
  'serverAddress': {'en': 'Server address', 'ar': 'عنوان الخادم'},
  'testConnection': {'en': 'TEST CONNECTION', 'ar': 'اختبار الاتصال'},
  'connectionOk': {'en': 'Connected! Server is healthy.', 'ar': 'تم الاتصال! الخادم يعمل.'},
  'connectionFail': {'en': 'Could not reach the server.', 'ar': 'تعذر الوصول إلى الخادم.'},
  'streak': {'en': 'day streak', 'ar': 'أيام متتالية'},
  'todayGoal': {'en': "Today's goal", 'ar': 'هدف اليوم'},
  'xp': {'en': 'XP', 'ar': 'نقطة'},
  'league': {'en': 'League', 'ar': 'الدوري'},
  'bronze': {'en': 'Bronze', 'ar': 'برونزي'},
  'silver': {'en': 'Silver', 'ar': 'فضي'},
  'gold': {'en': 'Gold', 'ar': 'ذهبي'},
  'emptyLibrary': {'en': 'No games yet!', 'ar': 'لا ألعاب بعد!'},
  'emptyLibrarySub': {'en': 'Create your first game and it will live here, replayable offline forever.', 'ar': 'أنشئ لعبتك الأولى وستبقى هنا، قابلة للعب دون إنترنت دائمًا.'},
  'play': {'en': 'PLAY', 'ar': 'العب'},
  'replay': {'en': 'REPLAY', 'ar': 'إعادة'},
  'generating': {'en': 'Building your adventure…', 'ar': 'نجهّز مغامرتك…'},
  'generatingSub': {'en': 'Play the tutorial while I craft your questions!', 'ar': 'العب التدريب بينما أحضّر أسئلتك!'},
  'genFailed': {'en': 'Generation hit a snag.', 'ar': 'تعثر إنشاء اللعبة.'},
  'retry': {'en': 'TRY AGAIN', 'ar': 'حاول مجددًا'},
  'offlineMode': {'en': 'Offline mode — demos only until a server is connected.', 'ar': 'وضع عدم الاتصال — الألعاب التجريبية فقط حتى الاتصال بخادم.'},
  'connectServer': {'en': 'CONNECT SERVER', 'ar': 'الاتصال بالخادم'},
  'continueOffline': {'en': 'Continue offline (demos only)', 'ar': 'المتابعة دون اتصال (تجريبي فقط)'},
  'deleted': {'en': 'Game removed', 'ar': 'حذفت اللعبة'},
  'bestScore': {'en': 'Best', 'ar': 'الأفضل'},
  'recentXp': {'en': 'Recent XP', 'ar': 'النقاط الأخيرة'},
  'changeTheme': {'en': 'Change theme', 'ar': 'تغيير الطابع'},
  'harder': {'en': 'Harder', 'ar': 'أصعب'},
  'easier': {'en': 'Easier', 'ar': 'أسهل'},
  'clarifyTitle': {'en': 'One quick question!', 'ar': 'سؤال سريع!'},
  'hudhudHome': {'en': 'What shall we explore today?', 'ar': 'ماذا سنستكشف اليوم؟'},
  'nahlaGoalDone': {'en': 'You did it! Goal complete!', 'ar': 'أحسنت! أكملت هدف اليوم!'},
};

String tr(BuildContext context, String key) {
  final lang = Directionality.of(context) == TextDirection.rtl ? 'ar' : 'en';
  return _strings[key]?[lang] ?? _strings[key]?['en'] ?? key;
}

String trLang(String lang, String key) =>
    _strings[key]?[lang] ?? _strings[key]?['en'] ?? key;
