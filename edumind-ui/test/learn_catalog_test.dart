import 'package:edumind/features/learn/learn_catalog.dart';
import 'package:edumind/features/learn/learn_models.dart';
import 'package:edumind/features/learn/widgets/learn_widget_registry.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('bundled learning catalogs parse and are internally consistent', () async {
    final catalogs = await LearnCatalogLoader.catalogs();
    expect(catalogs, isNotEmpty);

    for (final catalog in catalogs) {
      expect(catalog.paths, isNotEmpty);
      for (final path in catalog.paths) {
        expect(path.id, isNotEmpty);
        expect(path.experiences, isNotEmpty);

        for (final exp in path.experiences) {
          if (!exp.ready) continue;
          // A ready experience must be fully playable.
          expect(exp.steps, isNotEmpty, reason: '${path.id}/${exp.id}');

          for (final step in exp.steps) {
            // Every referenced manipulative exists in the registry.
            if (step.widget != null) {
              expect(
                kLearnWidgetBuilders.containsKey(step.widget!.type),
                isTrue,
                reason: 'unknown widget type "${step.widget!.type}" '
                    'in ${path.id}/${exp.id}',
              );
            }
            // Choices are answerable and self-explaining.
            final choice = step.choice;
            if (choice != null) {
              expect(choice.options.length, greaterThanOrEqualTo(2));
              expect(choice.correctIndex, inInclusiveRange(0, choice.options.length - 1));
              expect(choice.correctFeedback, isNotEmpty);
              expect(choice.wrongFeedback, isNotEmpty);
            }
            // Step kinds carry what their gating needs.
            switch (step.kind) {
              case LearnStepKind.explore:
              case LearnStepKind.challenge:
                expect(step.widget, isNotNull, reason: '${path.id}/${exp.id}');
              case LearnStepKind.choice:
                expect(step.choice, isNotNull, reason: '${path.id}/${exp.id}');
              case LearnStepKind.scene:
              case LearnStepKind.apply:
                break;
            }
          }
        }
      }
    }
  });

  test('the grade-7 math catalog ships the neighborhood triangle experience', () async {
    final catalogs = await LearnCatalogLoader.catalogs(language: 'ar');
    final math = catalogs.firstWhere((c) => c.subject == 'الرياضيات');
    expect(math.grade, 7);

    final path = math.paths.firstWhere((p) => p.id == 'neighborhood_engineer');
    final exp = path.experiences.firstWhere((e) => e.id == 'triangle_garden');
    expect(exp.ready, isTrue);
    // The pedagogy arc: situation → free action → prediction → constraint → application.
    expect(exp.steps.map((s) => s.kind).toList(), [
      LearnStepKind.scene,
      LearnStepKind.explore,
      LearnStepKind.choice,
      LearnStepKind.challenge,
      LearnStepKind.apply,
    ]);
    // The challenge target is reachable on the widget's own grid.
    final challenge = exp.steps.firstWhere((s) => s.kind == LearnStepKind.challenge);
    final target = challenge.widget!.params['targetArea'] as num;
    final maxDim = (challenge.widget!.params['maxDim'] as num).toInt();
    var reachable = false;
    for (var b = 2; b <= maxDim && !reachable; b++) {
      for (var h = 2; h <= maxDim && !reachable; h++) {
        if (b * h / 2 == target) reachable = true;
      }
    }
    expect(reachable, isTrue, reason: 'targetArea $target must be reachable');
  });

  test('triangle experience ships two context-lens variants that reword only the story', () async {
    final catalogs = await LearnCatalogLoader.catalogs(language: 'ar');
    final math = catalogs.firstWhere((c) => c.subject == 'الرياضيات');
    final path = math.paths.firstWhere((p) => p.id == 'neighborhood_engineer');
    final exp = path.experiences.firstWhere((e) => e.id == 'triangle_garden');

    final scene = exp.steps.firstWhere((s) => s.kind == LearnStepKind.scene);
    final challenge = exp.steps.firstWhere((s) => s.kind == LearnStepKind.challenge);

    for (final lens in ['market', 'water_energy']) {
      // The narrative changes through the lens…
      expect(scene.variants, contains(lens));
      expect(challenge.variants, contains(lens));
      expect(scene.titleFor(lens), isNot(scene.title));
      expect(scene.bodyFor(lens), isNot(scene.body));
      expect(challenge.bodyFor(lens), isNot(challenge.body));
      expect(challenge.successTextFor(lens), isNot(challenge.successText));
      // …while an unknown/absent lens falls back to the base story.
      expect(scene.titleFor(null), scene.title);
      expect(scene.titleFor('unknown_lens'), scene.title);
    }

    // Mechanics are lens-independent by construction: variants cannot carry a
    // widget or a choice, so the target and interaction are shared. Assert the
    // shared challenge params stay the known-good values.
    expect(challenge.widget!.params['targetArea'], 24);
    expect(challenge.widget!.params['unit'], 'م');
    final choice = exp.steps.firstWhere((s) => s.kind == LearnStepKind.choice);
    expect(choice.variants, isEmpty, reason: 'committed decisions are identical across lenses');
  });
}
