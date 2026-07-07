/// Evidence events and readiness derivation — pure logic, no widgets, fully
/// unit-testable. This is the Dart twin of backend/src/learning/evidence.ts
/// and readiness.ts; [readinessAlgoVersion] is shared so both sides agree on
/// how the same event log folds into the same readiness picture.
///
/// One event = one learner submission (a prediction picked, a manipulative
/// check, a recall item answered). Readiness is always DERIVED from the log,
/// never stored authoritatively, and always per skill × representation ×
/// context cell — there is no global learner level and no learning-style
/// label anywhere in this model.
library;

import 'dart:math';

/// Bump together with backend/src/learning/readiness.ts when the derivation
/// rules change, so mixed client/server views never disagree silently.
const readinessAlgoVersion = 1;

/// The diagnosable error patterns. Each maps to a specific support action
/// (see support_actions.dart) — never a generic "try again".
const kErrorPatterns = <String>{
  'concept_misunderstanding',
  'representation_confusion',
  'wrong_unit',
  'calculation_slip',
  'procedural_error',
  'transfer_difficulty',
};

/// Evidence kinds, derived from the step kind that produced the event
/// (explore→exploration, choice→prediction, challenge→construction,
/// apply→transfer, check→recall) — never authored.
const kEvidenceKinds = <String>{
  'exploration',
  'prediction',
  'construction',
  'transfer',
  'recall',
  'explanation',
};

final _rand = Random.secure();

/// Client-generated event id: 32 hex chars. Ids make the append-only log
/// idempotent everywhere (local cap, backend upsert, two-way sync).
String newEvidenceId() =>
    List.generate(32, (_) => _rand.nextInt(16).toRadixString(16)).join();

/// One learner submission — the LearningSignal pattern generalized.
class EvidenceEvent {
  const EvidenceEvent({
    required this.id,
    required this.skillId,
    required this.representation,
    this.context,
    required this.source,
    required this.kind,
    required this.outcome,
    required this.verification,
    this.attempt = 1,
    this.hints = 0,
    this.recovered = false,
    this.errorPattern,
    this.toolId,
    this.pathId,
    this.experienceId,
    this.stepIndex,
    this.ms,
    required this.createdAt,
  });

  final String id;
  final String skillId;

  /// manipulative | symbolic | verbal | table | graph | diagram
  final String representation;

  /// The learner's context lens (market, water_energy, …) or null.
  final String? context;

  /// learn_step | checkpoint | tutor_block | tool_verify
  final String source;

  /// See [kEvidenceKinds].
  final String kind;

  /// correct | partially_correct | incorrect | explored
  final String outcome;

  /// server_verified | client_reported — weighed differently in derivation.
  final String verification;

  /// nth explicit try on this task within the step.
  final int attempt;

  /// Hudhud help opens during this task.
  final int hints;

  /// Correct after a prior incorrect on the same step — recovery after
  /// support is strong evidence, not a blemish.
  final bool recovered;

  /// See [kErrorPatterns]; null when correct or undiagnosed.
  final String? errorPattern;

  final String? toolId;
  final String? pathId;
  final String? experienceId;
  final int? stepIndex;

  /// Time-on-task in milliseconds. Deliberately NEVER interpreted alone:
  /// [deriveReadiness] ignores it for scoring, so a slow correct answer is
  /// exactly as correct as a fast one (accessibility, device, and thinking
  /// time are not low readiness).
  final int? ms;

  final DateTime createdAt;

  Map<String, dynamic> toMap() => {
        'id': id,
        'skillId': skillId,
        'representation': representation,
        if (context != null) 'context': context,
        'source': source,
        'kind': kind,
        'outcome': outcome,
        'verification': verification,
        'attempt': attempt,
        'hints': hints,
        'recovered': recovered,
        if (errorPattern != null) 'errorPattern': errorPattern,
        if (toolId != null) 'toolId': toolId,
        if (pathId != null) 'pathId': pathId,
        if (experienceId != null) 'experienceId': experienceId,
        if (stepIndex != null) 'stepIndex': stepIndex,
        if (ms != null) 'ms': ms,
        'createdAt': createdAt.toUtc().toIso8601String(),
      };

  static EvidenceEvent? fromMap(Map<String, dynamic> m) {
    final id = m['id'] as String?;
    final skillId = m['skillId'] as String?;
    final createdAt = DateTime.tryParse((m['createdAt'] as String?) ?? '');
    if (id == null || skillId == null || createdAt == null) return null;
    return EvidenceEvent(
      id: id,
      skillId: skillId,
      representation: (m['representation'] as String?) ?? 'verbal',
      context: m['context'] as String?,
      source: (m['source'] as String?) ?? 'learn_step',
      kind: (m['kind'] as String?) ?? 'recall',
      outcome: (m['outcome'] as String?) ?? 'explored',
      verification: (m['verification'] as String?) ?? 'client_reported',
      attempt: (m['attempt'] as num?)?.toInt() ?? 1,
      hints: (m['hints'] as num?)?.toInt() ?? 0,
      recovered: (m['recovered'] as bool?) ?? false,
      errorPattern: m['errorPattern'] as String?,
      toolId: m['toolId'] as String?,
      pathId: m['pathId'] as String?,
      experienceId: m['experienceId'] as String?,
      stepIndex: (m['stepIndex'] as num?)?.toInt(),
      ms: (m['ms'] as num?)?.toInt(),
      createdAt: createdAt,
    );
  }
}

/// Per-cell readiness levels. `unseen` = no evidence at all; `emerging` =
/// touched but not yet reliable; `secure` needs both accuracy and enough
/// committed evidence — one lucky answer never reads as mastery.
enum ReadinessLevel { unseen, emerging, developing, secure }

/// The derived state of one skill × representation × context cell.
class Readiness {
  const Readiness({
    required this.skillId,
    required this.representation,
    this.context,
    required this.level,
    required this.score,
    required this.events,
    this.lastAt,
    this.recentErrorPatterns = const [],
  });

  final String skillId;

  /// '*' when aggregated across representations (see [deriveSkillReadiness]).
  final String representation;
  final String? context;
  final ReadinessLevel level;

  /// 0..1 decayed weighted accuracy over committed (non-explored) events.
  final double score;

  /// All events in the cell, exploration included.
  final int events;
  final DateTime? lastAt;

  /// Newest-first, at most 5 — what diagnosis and Hudhud react to.
  final List<String> recentErrorPatterns;
}

double _outcomeValue(EvidenceEvent e) {
  var value = switch (e.outcome) {
    'correct' => 1.0,
    'partially_correct' => 0.5,
    _ => 0.0,
  };
  // A correct answer that needed help still counts — at reduced weight,
  // never negative. Recovery after support is a bonus, not a stain.
  if (e.hints > 0 && value > 0) value *= 0.7;
  if (e.recovered && value > 0) value = min(1.0, value + 0.2);
  return value;
}

double _kindWeight(String kind) => switch (kind) {
      'construction' || 'transfer' => 1.25,
      'exploration' => 0.5,
      _ => 1.0,
    };

double _verificationWeight(String verification) =>
    verification == 'server_verified' ? 1.0 : 0.6;

/// Half-life of evidence weight, in days — old wins fade so the journey can
/// schedule revisits instead of trusting a month-old answer forever.
const _decayHalfLifeDays = 21.0;

class _Cell {
  double weightedValue = 0;
  double weight = 0;
  int committed = 0; // non-explored events
  int events = 0;
  DateTime? lastAt;
  final errors = <(DateTime, String)>[];
}

Readiness _finish(
    String skillId, String rep, String? ctx, _Cell c) {
  final score = c.weight <= 0 ? 0.0 : c.weightedValue / c.weight;
  final ReadinessLevel level;
  if (c.events == 0) {
    level = ReadinessLevel.unseen;
  } else if (c.committed >= 3 && score >= 0.75) {
    level = ReadinessLevel.secure;
  } else if (c.committed >= 1 && score >= 0.4) {
    level = ReadinessLevel.developing;
  } else {
    level = ReadinessLevel.emerging;
  }
  c.errors.sort((a, b) => b.$1.compareTo(a.$1));
  return Readiness(
    skillId: skillId,
    representation: rep,
    context: ctx,
    level: level,
    score: score,
    events: c.events,
    lastAt: c.lastAt,
    recentErrorPatterns: [for (final e in c.errors.take(5)) e.$2],
  );
}

Map<String, _Cell> _accumulate(
  Iterable<EvidenceEvent> events,
  String Function(EvidenceEvent) keyOf, {
  DateTime? now,
}) {
  final at = now ?? DateTime.now();
  final cells = <String, _Cell>{};
  for (final e in events) {
    final cell = cells.putIfAbsent(keyOf(e), _Cell.new);
    cell.events++;
    if (cell.lastAt == null || e.createdAt.isAfter(cell.lastAt!)) {
      cell.lastAt = e.createdAt;
    }
    if (e.errorPattern != null) cell.errors.add((e.createdAt, e.errorPattern!));
    if (e.outcome == 'explored') continue; // participation, not accuracy
    final ageDays =
        max(0, at.difference(e.createdAt).inHours) / 24.0;
    final weight = _verificationWeight(e.verification) *
        _kindWeight(e.kind) *
        pow(0.5, ageDays / _decayHalfLifeDays);
    cell.weightedValue += weight * _outcomeValue(e);
    cell.weight += weight;
    cell.committed++;
  }
  return cells;
}

/// skill|representation|context → readiness. The full-resolution view that
/// checkpoint selection and representation-gap detection read.
Map<String, Readiness> deriveReadiness(Iterable<EvidenceEvent> events,
    {DateTime? now}) {
  final cells = _accumulate(
    events,
    (e) => '${e.skillId}|${e.representation}|${e.context ?? ''}',
    now: now,
  );
  return cells.map((key, cell) {
    final parts = key.split('|');
    return MapEntry(
      key,
      _finish(parts[0], parts[1], parts[2].isEmpty ? null : parts[2], cell),
    );
  });
}

/// skillId → readiness aggregated across representations and contexts — the
/// coarse view the journey map's next-goal chip and Hudhud's compact context
/// read. Representation is reported as '*'.
Map<String, Readiness> deriveSkillReadiness(Iterable<EvidenceEvent> events,
    {DateTime? now}) {
  final cells = _accumulate(events, (e) => e.skillId, now: now);
  return cells.map((skillId, cell) =>
      MapEntry(skillId, _finish(skillId, '*', null, cell)));
}
