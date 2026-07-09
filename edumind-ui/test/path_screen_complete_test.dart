import 'package:edumind/app_localizations.dart';
import 'package:edumind/core/session.dart';
import 'package:edumind/features/learn/learn_evidence_store.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:edumind/features/learn/learn_progress_store.dart';
import 'package:edumind/features/learn/path_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A one-experience path so pathProgress() can reach done == ready.
LearnPath _path({required String lifeConnection}) => LearnPath.fromMap({
      'id': 'test_path_complete',
      'title': 'مسار الاختبار',
      'tagline': 'للاختبار',
      'lifeConnection': lifeConnection,
      'experiences': [
        {
          'id': 'exp_done',
          'title': 'تجربة مكتملة',
          'subtitle': '',
          'status': 'ready',
          'steps': [
            {'kind': 'scene', 'title': 'مشهد', 'body': 'بداية'},
          ],
        },
      ],
    });

Widget _app(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: child,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    LearnProgressStore.resetForTesting();
    LearnEvidenceStore.resetForTesting();
    SharedPreferences.setMockInitialValues({});
    await Session.load();
  });

  testWidgets('Hudhud\'s path-complete summary appears once every ready station is done',
      (tester) async {
    final path = _path(lifeConnection: 'هذه هي فائدة هذا المسار في الحياة.');
    final store = await LearnProgressStore.load();
    await store.markCompleted(path.id, 'exp_done');

    await tester.pumpWidget(_app(PathScreen(path: path)));
    // The completion card's Mascot animates forever (a perpetual Ticker) —
    // pumpAndSettle would never return, so timed pumps only (same pattern
    // as onboarding_flow_test.dart's completion beat).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('شوف شو اكتشفت!'), findsOneWidget);
    expect(find.text('هذه هي فائدة هذا المسار في الحياة.'), findsOneWidget);
  });

  testWidgets('no summary while a ready station remains unfinished', (tester) async {
    final path = _path(lifeConnection: 'هذه هي فائدة هذا المسار في الحياة.');
    // no completion recorded — the one ready station is still open.

    await tester.pumpWidget(_app(PathScreen(path: path)));
    await tester.pumpAndSettle();

    expect(find.text('شوف شو اكتشفت!'), findsNothing);
  });
}
