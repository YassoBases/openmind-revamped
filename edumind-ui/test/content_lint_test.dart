import 'dart:convert';
import 'dart:io';

import 'package:edumind/features/learn/learn_models.dart';
import 'package:flutter_test/flutter_test.dart';

/// Content lints — the durable half of the content-repair pass. These encode
/// the editorial rules so a regression cannot silently re-enter:
///  1. structural sanity (correctIndex in range, patterns aligned);
///  2. every referenced skill id is defined in the catalog's skills map;
///  3. a checkpoint only tests skills the path's steps actually evidence;
///  4. hints and wrongFeedback never contain the correct option verbatim;
///  5. a step that carries narrative lens variants and a choice must flavor
///     the choice too (no flavor drop mid-step);
///  6. choice variants keep the option count (the correct slot is positional).
List<LearnCatalog> _loadCatalogs() {
  final dir = Directory('assets/learning');
  return dir
      .listSync()
      .whereType<File>()
      .where((f) => f.path.endsWith('.json'))
      .map((f) => LearnCatalog.fromMap(
          jsonDecode(f.readAsStringSync()) as Map<String, dynamic>))
      .toList();
}

Iterable<({LearnPath path, LearnExperience exp, LearnStep step})> _readySteps(
    LearnCatalog c) sync* {
  for (final p in c.paths) {
    for (final e in p.experiences.where((e) => e.ready)) {
      for (final s in e.steps) {
        yield (path: p, exp: e, step: s);
      }
    }
  }
}

void main() {
  final catalogs = _loadCatalogs();

  test('catalogs load and hold at least one ready experience', () {
    expect(catalogs, isNotEmpty);
    expect(
      catalogs.expand((c) => c.paths).expand((p) => p.experiences).where((e) => e.ready),
      isNotEmpty,
    );
  });

  test('structural sanity: correct index in range, aligned pattern lists', () {
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final items = [
          if (r.step.choice != null) r.step.choice!,
          ...r.step.checkItems,
        ];
        for (final item in items) {
          expect(item.correctIndex, inInclusiveRange(0, item.options.length - 1),
              reason: '${r.exp.id}: correctIndex out of range');
          if (item.distractorPatterns.isNotEmpty) {
            expect(item.distractorPatterns.length, item.options.length,
                reason: '${r.exp.id}: distractorPatterns misaligned with options');
          }
        }
      }
    }
  });

  test('every referenced skill id is defined in the catalog skills map', () {
    for (final c in catalogs) {
      final defined = c.skills.keys.toSet();
      final referenced = <String>{};
      for (final p in c.paths) {
        for (final cp in p.checkpoints) {
          referenced.addAll(cp.skills);
        }
        for (final e in p.experiences) {
          for (final s in e.steps) {
            referenced.addAll(s.skills);
            for (final item in s.checkItems) {
              referenced.addAll(item.skills);
            }
          }
        }
      }
      final unknown = referenced.difference(defined);
      expect(unknown, isEmpty,
          reason: '${c.subject}: skills referenced but never defined: $unknown');
    }
  });

  test('a checkpoint only tests skills its path actually evidences', () {
    for (final c in catalogs) {
      for (final p in c.paths) {
        final taught = <String>{};
        for (final e in p.experiences) {
          for (final s in e.steps) {
            taught.addAll(s.skills);
            for (final item in s.checkItems) {
              taught.addAll(item.skills);
            }
          }
        }
        for (final cp in p.checkpoints) {
          final untaught = cp.skills.toSet().difference(taught);
          expect(untaught, isEmpty,
              reason:
                  '${p.id}/${cp.id}: checkpoint tests skills no step evidences: $untaught');
        }
      }
    }
  });

  test('hints and wrongFeedback never hand over the correct option verbatim', () {
    String norm(String s) => s.replaceAll(RegExp(r'\s+'), ' ').trim();
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final items = [
          if (r.step.choice != null) r.step.choice!,
          ...r.step.checkItems,
        ];
        for (final item in items) {
          final answer = norm(item.options[item.correctIndex]);
          // Very short answers ('7') appear legitimately inside guidance
          // ("subtract 5 from 12"); the verbatim rule is for full phrases.
          if (answer.length < 4) continue;
          final leaks = <String>[
            ...r.step.hints,
            item.wrongFeedback,
            for (final v in item.variants.values)
              if (v.wrongFeedback != null) v.wrongFeedback!,
          ];
          for (final text in leaks) {
            expect(norm(text).contains(answer), isFalse,
                reason:
                    '${r.exp.id} «${item.prompt}»: guidance contains the correct answer "$answer"');
          }
        }
      }
    }
  });

  test('a step with narrative lens variants flavors its choice too', () {
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final step = r.step;
        if (step.variants.isEmpty || step.choice == null) continue;
        for (final lens in step.variants.keys) {
          expect(step.choice!.variants.containsKey(lens), isTrue,
              reason:
                  '${r.exp.id} «${step.title}»: story is flavored for "$lens" but its choice is not — flavor drops mid-step');
        }
      }
    }
  });

  test('choice variants keep the option count (correct slot is positional)', () {
    for (final c in catalogs) {
      for (final r in _readySteps(c)) {
        final items = [
          if (r.step.choice != null) r.step.choice!,
          ...r.step.checkItems,
        ];
        for (final item in items) {
          for (final entry in item.variants.entries) {
            final options = entry.value.options;
            if (options != null) {
              expect(options.length, item.options.length,
                  reason:
                      '${r.exp.id} «${item.prompt}» [${entry.key}]: variant option count differs');
            }
          }
        }
      }
    }
  });
}
