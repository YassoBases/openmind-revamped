import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Local session: server URL, device token, cached profile.
/// Data minimization: nickname only, never an email or real name.
class Session {
  Session._(this._prefs);
  static Session? _instance;
  final SharedPreferences _prefs;

  static const _defaultBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:8080');

  static Future<Session> load() async {
    _instance ??= Session._(await SharedPreferences.getInstance());
    return _instance!;
  }

  static Session get instance => _instance!;

  String get baseUrl => _prefs.getString('baseUrl') ?? _defaultBaseUrl;
  Future<void> setBaseUrl(String url) =>
      _prefs.setString('baseUrl', url.trim().replaceAll(RegExp(r'/+$'), ''));

  String? get token => _prefs.getString('token');
  String? get studentId => _prefs.getString('studentId');

  Future<void> setAuth(String studentId, String token) async {
    await _prefs.setString('studentId', studentId);
    await _prefs.setString('token', token);
  }

  Map<String, dynamic>? get profile {
    final raw = _prefs.getString('profile');
    return raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> setProfile(Map<String, dynamic> profile) =>
      _prefs.setString('profile', jsonEncode(profile));

  bool get onboarded => profile != null;
  bool get registered => token != null;

  String get language => (profile?['language'] as String?) ?? 'en';
  String get color => (profile?['color'] as String?) ?? '#58CC02';
  String get name => (profile?['name'] as String?) ?? 'Player';

  Future<void> reset() async {
    await _prefs.remove('token');
    await _prefs.remove('studentId');
    await _prefs.remove('profile');
  }
}
