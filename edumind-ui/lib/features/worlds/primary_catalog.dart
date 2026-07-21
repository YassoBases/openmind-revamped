/// The curated primary-grades lesson catalog (Lesson Worlds picker).
///
/// Deliberately LIGHT: an entry is a picker row + generation grounding
/// (title + focusConcepts feed the world planner) — never authored lesson
/// content. Grade is a hard filter, mirroring the middle-school catalog
/// doctrine: a child only ever sees their own grade's lessons. Language
/// falls back within a grade (ar-first product; en mirrors bundled).
library;

import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

class PrimaryLesson {
  const PrimaryLesson({required this.id, required this.title, required this.focusConcepts});

  final String id;
  final String title;
  final List<String> focusConcepts;

  static PrimaryLesson fromMap(Map<String, dynamic> m) => PrimaryLesson(
        id: m['id'] as String,
        title: m['title'] as String,
        focusConcepts: ((m['focusConcepts'] as List?) ?? const [])
            .whereType<String>()
            .toList(),
      );
}

class PrimaryCatalog {
  const PrimaryCatalog({
    required this.subject,
    required this.subjectTitle,
    required this.grade,
    required this.language,
    required this.lessons,
  });

  final String subject; // 'math' | 'science' — wire value
  final String subjectTitle; // localized display name
  final int grade;
  final String language;
  final List<PrimaryLesson> lessons;

  static PrimaryCatalog fromMap(Map<String, dynamic> m) => PrimaryCatalog(
        subject: m['subject'] as String,
        subjectTitle: (m['subjectTitle'] as String?) ?? (m['subject'] as String),
        grade: (m['grade'] as num).toInt(),
        language: m['language'] as String,
        lessons: ((m['lessons'] as List?) ?? const [])
            .whereType<Map>()
            .map((l) => PrimaryLesson.fromMap(l.cast<String, dynamic>()))
            .toList(),
      );
}

class PrimaryCatalogLoader {
  /// Bundled files, hardcoded like the middle-school manifest — adding a
  /// grade/subject is adding JSON + one row here, no screen changes.
  static const _manifest = <({String subject, int grade, String language, String file})>[
    (subject: 'math', grade: 1, language: 'ar', file: 'math_grade1.ar.json'),
    (subject: 'math', grade: 2, language: 'ar', file: 'math_grade2.ar.json'),
    (subject: 'math', grade: 3, language: 'ar', file: 'math_grade3.ar.json'),
    (subject: 'science', grade: 1, language: 'ar', file: 'science_grade1.ar.json'),
    (subject: 'science', grade: 2, language: 'ar', file: 'science_grade2.ar.json'),
    (subject: 'science', grade: 3, language: 'ar', file: 'science_grade3.ar.json'),
    (subject: 'math', grade: 1, language: 'en', file: 'math_grade1.en.json'),
    (subject: 'math', grade: 2, language: 'en', file: 'math_grade2.en.json'),
    (subject: 'math', grade: 3, language: 'en', file: 'math_grade3.en.json'),
    (subject: 'science', grade: 1, language: 'en', file: 'science_grade1.en.json'),
    (subject: 'science', grade: 2, language: 'en', file: 'science_grade2.en.json'),
    (subject: 'science', grade: 3, language: 'en', file: 'science_grade3.en.json'),
  ];

  /// Catalogs for [grade] in [language]; per-subject language fallback within
  /// the SAME grade only (grade is never crossed). An uncovered grade returns
  /// an empty list — the picker then offers the free-topic path alone.
  static Future<List<PrimaryCatalog>> load(int grade, String language) async {
    final result = <PrimaryCatalog>[];
    for (final subject in const ['math', 'science']) {
      final exact = _manifest.where(
          (e) => e.subject == subject && e.grade == grade && e.language == language);
      final fallback = _manifest.where((e) => e.subject == subject && e.grade == grade);
      final entry = exact.isNotEmpty ? exact.first : (fallback.isNotEmpty ? fallback.first : null);
      if (entry == null) continue;
      try {
        final raw = await rootBundle
            .loadString('assets/learning/primary/${entry.file}');
        result.add(PrimaryCatalog.fromMap(jsonDecode(raw) as Map<String, dynamic>));
      } catch (_) {/* a missing asset never breaks the picker */}
    }
    return result;
  }
}
