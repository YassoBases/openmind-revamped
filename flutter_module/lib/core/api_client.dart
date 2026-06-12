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

  static Future<Map<String, dynamic>> createGame(Map<String, dynamic> body) async =>
      (await post('/api/v1/games', body)) as Map<String, dynamic>;

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
}
