import 'package:edumind/core/spec_assembler.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('bundled demo specs assemble into playable shells', () async {
    final specs = await SpecAssembler.demoSpecs();

    expect(specs, hasLength(4));
    for (final spec in specs) {
      final meta = spec['meta'] as Map<String, dynamic>;
      final gameType = meta['gameType'] as String;
      final html = await SpecAssembler.assemble(gameType, spec);

      expect(html, contains('"specVersion"'));
      expect(html, isNot(contains('/*__EDUMIND_SPEC_JSON__*/null')));
    }
  });
}
