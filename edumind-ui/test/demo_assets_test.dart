import 'package:edumind/core/spec_assembler.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('bundled demo specs assemble into playable shells', () async {
    final specs = await SpecAssembler.demoSpecs();

    expect(specs, hasLength(6));
    final gameTypes = <String>{};
    for (final spec in specs) {
      final meta = spec['meta'] as Map<String, dynamic>;
      final gameType = meta['gameType'] as String;
      gameTypes.add(gameType);
      final html = await SpecAssembler.assemble(gameType, spec);

      expect(html, contains('"specVersion"'));
      expect(html, isNot(contains('/*__EDUMIND_SPEC_JSON__*/null')));
    }
    // every generatable shell has at least one bundled offline demo
    expect(gameTypes,
        containsAll(['quest_path', 'goal_shootout', 'draw_connect', 'scene_play']));
  });
}
