import 'package:flutter_test/flutter_test.dart';
import 'package:edumind/features/learn/lesson_scoring.dart';

void main() {
  group('starsFor', () {
    test('a clean, unaided pass earns full marks', () {
      expect(starsFor(correct: true, hintRung: 0), 3);
    });

    test('each hint-ladder rung used costs one star', () {
      expect(starsFor(correct: true, hintRung: 1), 2);
      expect(starsFor(correct: true, hintRung: 2), 1);
    });

    test('stars never drop below the floor even with every rung used', () {
      expect(starsFor(correct: true, hintRung: 3), 1);
      expect(starsFor(correct: true, hintRung: 99), 1);
    });

    test('a step not landed still earns the "you tried" star, never zero', () {
      expect(starsFor(correct: false, hintRung: 0), 1);
      expect(starsFor(correct: false, hintRung: 2), 1);
    });
  });

  group('starsForCheck', () {
    test('a clean sweep earns full marks', () {
      expect(starsForCheck(correct: 3, total: 3), 3);
    });

    test('a majority correct earns the middle mark', () {
      expect(starsForCheck(correct: 2, total: 3), 2);
    });

    test('a minority correct still earns the "you tried" star', () {
      expect(starsForCheck(correct: 1, total: 3), 1);
      expect(starsForCheck(correct: 0, total: 3), 1);
    });

    test('no items is a degenerate case that still earns something', () {
      expect(starsForCheck(correct: 0, total: 0), 1);
    });
  });

  test('kSceneStars is the flat participation mark', () {
    expect(kSceneStars, 1);
  });
}
