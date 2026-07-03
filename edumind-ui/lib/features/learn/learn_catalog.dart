import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

import 'learn_models.dart';

/// Bundled learning-catalog loading — same pattern as SpecAssembler:
/// curated JSON ships as assets, loads offline, and is cached per file.
/// New subjects/grades = new files in this list (and pubspec assets).
class LearnCatalogLoader {
  static const _files = ['math_grade7.ar.json'];
  static final Map<String, LearnCatalog> _cache = {};

  static Future<LearnCatalog> _load(String file) async {
    if (_cache[file] case final cached?) return cached;
    final raw = await rootBundle.loadString('assets/learning/$file');
    return _cache[file] =
        LearnCatalog.fromMap(jsonDecode(raw) as Map<String, dynamic>);
  }

  /// Catalogs for the student's language, falling back to everything —
  /// content should never disappear just because a translation is missing.
  static Future<List<LearnCatalog>> catalogs({String? language}) async {
    final all = [for (final f in _files) await _load(f)];
    if (language == null) return all;
    final matching = all.where((c) => c.language == language).toList();
    return matching.isEmpty ? all : matching;
  }
}
