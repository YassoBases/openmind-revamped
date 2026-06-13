import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

/// Client-side shell assembly — identical to the backend/harness logic:
/// load the bundled template shell, replace the spec-slot marker with the
/// (escaped) GameSpec JSON. Fully offline, KBs of spec + bundled shell.
class SpecAssembler {
  static const _marker = '/*__EDUMIND_SPEC_JSON__*/null';
  static final Map<String, String> _shellCache = {};

  static Future<String> loadShell(String gameType) async {
    return _shellCache[gameType] ??=
        await rootBundle.loadString('assets/shells/$gameType.html');
  }

  /// `<` is escaped (<) so spec content can never break out of the
  /// script tag.
  static String safeJson(Map<String, dynamic> spec) =>
      jsonEncode(spec).replaceAll('<', r'<');

  static Future<String> assemble(String gameType, Map<String, dynamic> spec) async {
    final shell = await loadShell(gameType);
    return shell.replaceFirst(_marker, safeJson(spec));
  }

  /// Build a progressive-start stub locally (mirror of shared buildStubSpec).
  static Map<String, dynamic> buildStub(Map<String, dynamic> meta, Map<String, dynamic> student) => {
        'specVersion': 1,
        'stub': true,
        'meta': meta,
        'student': student,
        'levels': const <dynamic>[],
      };

  static Future<List<Map<String, dynamic>>> demoSpecs() async {
    const files = [
      'quest_path_water_cycle.en.json',
      'goal_shootout_world_capitals.en.json',
      'draw_connect_plant_cell.en.json',
      'quest_path_water_cycle.ar.json',
    ];
    final specs = <Map<String, dynamic>>[];
    for (final f in files) {
      final raw = await rootBundle.loadString('assets/samples/$f');
      specs.add(jsonDecode(raw) as Map<String, dynamic>);
    }
    return specs;
  }
}
