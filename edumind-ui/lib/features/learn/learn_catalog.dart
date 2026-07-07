import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

import 'learn_models.dart';

/// Bundled learning-catalog loading — same pattern as SpecAssembler:
/// curated JSON ships as assets, loads offline, and is cached per file.
/// New subjects/grades = new manifest entries (and pubspec assets).
class LearnCatalogLoader {
  /// Every bundled catalog with the (grade, language) it truthfully covers.
  /// The metadata lives here — not inside the JSON read — so grade gating
  /// never needs to load a file to know it is for another grade.
  static const _manifest = [
    (file: 'math_grade7.ar.json', grade: 7, language: 'ar'),
    (file: 'social_studies_grade7.ar.json', grade: 7, language: 'ar'),
  ];
  static final Map<String, LearnCatalog> _cache = {};

  static Future<LearnCatalog> _load(String file) async {
    if (_cache[file] case final cached?) return cached;
    final raw = await rootBundle.loadString('assets/learning/$file');
    return _cache[file] =
        LearnCatalog.fromMap(jsonDecode(raw) as Map<String, dynamic>);
  }

  /// Catalogs for the student's grade and language.
  ///
  /// Grade is a HARD filter — a grade-8 learner never receives grade-7
  /// content dressed up as their own; an empty result is the honest answer
  /// the UI must design for. The language fallback (missing translation
  /// should not hide content) applies only within the grade's entries.
  static Future<List<LearnCatalog>> catalogs({
    String? language,
    required int grade,
  }) async {
    final forGrade = _manifest.where((e) => e.grade == grade).toList();
    var entries = forGrade;
    if (language != null) {
      final matching = forGrade.where((e) => e.language == language).toList();
      if (matching.isNotEmpty) entries = matching;
    }
    return [for (final e in entries) await _load(e.file)];
  }
}
