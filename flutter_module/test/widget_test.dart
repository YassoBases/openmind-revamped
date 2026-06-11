import 'package:flutter_test/flutter_test.dart';
import 'package:edumind_app/widgets/candy_button.dart';
import 'package:edumind_app/widgets/mascot.dart';
import 'package:flutter/material.dart';

void main() {
  testWidgets('candy button renders and taps', (tester) async {
    var tapped = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: CandyButton(label: 'PLAY', onTap: () => tapped = true),
        ),
      ),
    ));
    expect(find.text('PLAY'), findsOneWidget);
    await tester.tap(find.text('PLAY'));
    expect(tapped, isTrue);
  });

  testWidgets('hoopoe and bee paint all expressions without errors', (tester) async {
    for (final character in MascotCharacter.values) {
      for (final expr in MascotExpression.values) {
        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: Center(child: Mascot(expression: expr, character: character)),
          ),
        ));
        expect(find.byType(Mascot), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    }
  });
}
