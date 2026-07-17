import 'api_client.dart';
import 'session.dart';

/// Retries backend registration for a profile that finished onboarding while
/// the server was unreachable — [ProfileBridge.finishSetup] always saves the
/// local profile first, so onboarding never blocks on the network, but that
/// leaves the account "pending" (a local profile with no server-issued
/// token) until this succeeds.
///
/// Safe to call from anywhere, anytime: a no-op once registered or when
/// onboarding hasn't produced a profile yet, and concurrent calls collapse
/// into the single in-flight request — a flaky connection retried from both
/// app startup and a resume event never creates two accounts for the same
/// profile.
///
/// That in-flight lock only protects concurrent calls within one running
/// process, though — it can't help if the server created the account but
/// the process died (or the connection dropped) before the response
/// arrived; the next retry would be a fresh call with no memory of the
/// first. That case is handled server-side: every request carries
/// [Session.installationId], a persistent per-device id the backend
/// enforces as unique, so a retry after a lost response returns the SAME
/// account (with a freshly issued token) instead of creating a duplicate.
class RegistrationSync {
  RegistrationSync._();

  static Future<bool>? _inFlight;

  /// True once onboarding has produced a local profile but the backend
  /// hasn't confirmed a student account (device token) for it yet.
  static bool get isPending => Session.instance.onboarded && !Session.instance.registered;

  /// Registers the locally-saved profile if it isn't already registered.
  /// Returns true once the student is registered (immediately if it already
  /// was, or as the result of this attempt); false while still pending.
  static Future<bool> retry() {
    if (Session.instance.registered) return Future.value(true);
    if (!Session.instance.onboarded) return Future.value(false);
    return _inFlight ??= _attempt().whenComplete(() => _inFlight = null);
  }

  static Future<bool> _attempt() async {
    final profile = Session.instance.profile;
    if (profile == null) return false;
    try {
      final installationId = await Session.instance.installationId();
      final res = await Api.createStudent({...profile, 'installationId': installationId});
      await Session.instance.setAuth(res['studentId'] as String, res['token'] as String);
      final student = res['student'];
      if (student is Map<String, dynamic>) {
        await Session.instance.applyStudentView(student);
      }
      return true;
    } catch (_) {
      return false; // still offline / server unreachable — try again later
    }
  }
}
