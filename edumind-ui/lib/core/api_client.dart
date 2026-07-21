import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'session.dart';

class ApiException implements Exception {
  ApiException(this.status, this.code, this.message);
  final int status;
  final String code;
  final String message;
  @override
  String toString() => '$code: $message';
}

/// REST client for the EduMind backend (/api/v1).
/// Base URL is configurable via --dart-define=API_BASE_URL and the in-app
/// settings screen, so a phone can point at a laptop's LAN IP at runtime.
class Api {
  static String get _base => Session.instance.baseUrl;

  // Only send content-type when there's actually a body — Fastify rejects an
  // empty body that carries `content-type: application/json`
  // (FST_ERR_CTP_EMPTY_JSON_BODY), which bodyless POSTs like streak-check and
  // retry would otherwise trip.
  static Map<String, String> _headers({bool auth = true, bool withBody = false}) => {
        if (withBody) 'content-type': 'application/json',
        if (auth && Session.instance.token != null)
          'authorization': 'Bearer ${Session.instance.token}',
      };

  static Future<dynamic> _decode(http.Response res) async {
    if (res.statusCode == 204) return null;
    final body = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      final err = (body is Map && body['error'] is Map) ? body['error'] as Map : null;
      throw ApiException(res.statusCode, (err?['code'] as String?) ?? 'HTTP_${res.statusCode}',
          (err?['message'] as String?) ?? 'request failed');
    }
    return body;
  }

  static Future<dynamic> get(String path, {bool auth = true}) async =>
      _decode(await http
          .get(Uri.parse('$_base$path'), headers: _headers(auth: auth))
          .timeout(const Duration(seconds: 20)));

  static Future<dynamic> post(String path, [Object? body, bool auth = true]) async =>
      _decode(await http
          .post(Uri.parse('$_base$path'),
              headers: _headers(auth: auth, withBody: body != null),
              body: body == null ? null : jsonEncode(body))
          .timeout(const Duration(seconds: 30)));

  static Future<dynamic> patch(String path, Object body) async =>
      _decode(await http
          .patch(Uri.parse('$_base$path'),
              headers: _headers(withBody: true), body: jsonEncode(body))
          .timeout(const Duration(seconds: 20)));

  static Future<dynamic> delete(String path) async =>
      _decode(await http
          .delete(Uri.parse('$_base$path'), headers: _headers())
          .timeout(const Duration(seconds: 20)));

  // ---- typed helpers -----------------------------------------------------

  /// The settings screen's Test Connection button.
  static Future<Map<String, dynamic>?> health() async {
    try {
      final res = await http
          .get(Uri.parse('$_base/api/v1/health'))
          .timeout(const Duration(seconds: 6));
      if (res.statusCode != 200) return null;
      return jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>> createStudent(Map<String, dynamic> body) async =>
      (await post('/api/v1/students', body, false)) as Map<String, dynamic>;

  /// Trusted student view (grade, stage, learningContext, …).
  static Future<Map<String, dynamic>> me() async =>
      (await get('/api/v1/students/me')) as Map<String, dynamic>;

  static Future<Map<String, dynamic>> patchMe(Map<String, dynamic> body) async =>
      (await patch('/api/v1/students/me', body)) as Map<String, dynamic>;

  /// Middle-school learning progress — completed experiences on the server.
  static Future<Map<String, dynamic>> learnProgress() async =>
      (await get('/api/v1/learn/progress')) as Map<String, dynamic>;

  /// Idempotent completion upsert for one experience.
  static Future<Map<String, dynamic>> putLearnProgress(String pathId, String experienceId) async =>
      (await _decode(await http
          .put(Uri.parse('$_base/api/v1/learn/progress'),
              headers: _headers(withBody: true),
              body: jsonEncode({'pathId': pathId, 'experienceId': experienceId}))
          .timeout(const Duration(seconds: 20)))) as Map<String, dynamic>;

  /// Server-side verification for a lesson-experience widget's attempt — the
  /// same ToolDescriptor.verifyResult the tutor trusts, reused so an authored
  /// lesson challenge is never graded by client code alone. Returns
  /// {verdict, errorPattern?}: verdict is 'correct' | 'partially_correct' |
  /// 'incorrect' | 'explored' | 'invalid' | 'unverifiable'; errorPattern is
  /// the tool's diagnosis of a wrong answer when it has one. When [evidence]
  /// (skill/representation/position context) is supplied, the server also
  /// records the graded attempt as an evidence row.
  static Future<Map<String, dynamic>> verifyTool(
    String toolId,
    Map<String, dynamic> data,
    Map<String, dynamic> answer, {
    Map<String, dynamic>? evidence,
  }) async =>
      (await post('/api/v1/tools/$toolId/verify', {
        'data': data,
        'answer': answer,
        if (evidence != null) 'evidence': evidence,
      })) as Map<String, dynamic>;

  /// The learner's evidence log on the server (append-only, ids are
  /// client-generated — see LearnEvidenceStore).
  static Future<Map<String, dynamic>> learnEvidence() async =>
      (await get('/api/v1/learn/evidence')) as Map<String, dynamic>;

  /// Idempotent batch append of evidence events (deduped by event id).
  static Future<Map<String, dynamic>> postLearnEvidence(
          List<Map<String, dynamic>> events) async =>
      (await post('/api/v1/learn/evidence', {'events': events}))
          as Map<String, dynamic>;

  static Future<Map<String, dynamic>> createGame(Map<String, dynamic> body) async =>
      (await post('/api/v1/games', body)) as Map<String, dynamic>;

  /// Ask Hudhud: question + optional learning context → structured reply.
  static Future<Map<String, dynamic>> askTutor(Map<String, dynamic> body) async =>
      (await post('/api/v1/tutor/messages', body)) as Map<String, dynamic>;

  static Future<Map<String, dynamic>> tutorConversation(String id) async =>
      (await get('/api/v1/tutor/conversations/$id')) as Map<String, dynamic>;

  static Future<Map<String, dynamic>> gameStatus(String id) async =>
      (await get('/api/v1/games/$id')) as Map<String, dynamic>;

  /// Polls until the game is ready; returns the GameSpec. Throws on failure.
  static Future<Map<String, dynamic>> waitForSpec(String id,
      {Duration interval = const Duration(seconds: 2), Duration timeout = const Duration(seconds: 90)}) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final status = await gameStatus(id);
      if (status['status'] == 'ready') {
        return (await get('/api/v1/games/$id/spec')) as Map<String, dynamic>;
      }
      if (status['status'] == 'failed') {
        throw ApiException(410, 'GENERATION_FAILED', (status['error'] as String?) ?? 'generation failed');
      }
      await Future<void>.delayed(interval);
    }
    throw ApiException(408, 'TIMEOUT', 'generation timed out');
  }

  // ---- Lesson Worlds ------------------------------------------------------

  /// One request: plan + playable stage-1 spec (or a clarifying question).
  /// Longer timeout than plain posts — the combined plan+stage-1 LLM call is
  /// the one wait a world ever shows, and weak links deserve the slack.
  static Future<Map<String, dynamic>> createWorld(Map<String, dynamic> body) async =>
      (await _decode(await http
          .post(Uri.parse('$_base/api/v1/worlds'),
              headers: _headers(withBody: true), body: jsonEncode(body))
          .timeout(const Duration(seconds: 75)))) as Map<String, dynamic>;

  static Future<Map<String, dynamic>> listWorlds() async =>
      (await get('/api/v1/worlds')) as Map<String, dynamic>;

  /// World + per-stage map state (status, stars, plan info per stage).
  static Future<Map<String, dynamic>> worldState(String id) async =>
      (await get('/api/v1/worlds/$id')) as Map<String, dynamic>;

  /// One attempt at a stage spec: the spec (200) or null while generating
  /// (202 body `{status:'generating'}`). Fetching stage N also prefetches
  /// stage N+1 server-side.
  static Future<Map<String, dynamic>?> stageSpecOnce(String worldId, int index) async {
    final body = (await get('/api/v1/worlds/$worldId/stages/$index/spec'))
        as Map<String, dynamic>?;
    if (body == null || body['status'] == 'generating') return null;
    return body;
  }

  /// Idempotent generation kick (used by the building screen / failed stages).
  static Future<Map<String, dynamic>> kickStage(String worldId, int index) async =>
      (await post('/api/v1/worlds/$worldId/stages/$index/generate'))
          as Map<String, dynamic>;

  /// Polls the stage spec until ready (building-screen rhythm).
  static Future<Map<String, dynamic>> waitForStageSpec(String worldId, int index,
      {Duration interval = const Duration(seconds: 2), Duration timeout = const Duration(seconds: 90)}) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final spec = await stageSpecOnce(worldId, index);
      if (spec != null) return spec;
      await Future<void>.delayed(interval);
    }
    throw ApiException(408, 'TIMEOUT', 'stage generation timed out');
  }

  /// Records a stage run; returns stars + XP + streak + enriched feedback.
  static Future<Map<String, dynamic>> postStageSession(
          String worldId, int index, Map<String, dynamic> summary) async =>
      (await post('/api/v1/worlds/$worldId/stages/$index/sessions',
          {'summary': summary})) as Map<String, dynamic>;
}
