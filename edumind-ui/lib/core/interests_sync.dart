import 'api_client.dart';
import 'session.dart';

/// Retries `PATCH /students/me` for interests that were saved locally
/// ([Session.setInterests]) but never confirmed by the server — a failed
/// PATCH, or a save that happened while the account was still registering.
///
/// Ask Hudhud reads interests from the authenticated student row server-side
/// (never from the client request), so the tutor only ever reflects
/// interests once this sync actually lands — there is nothing else to wire
/// up for that guarantee, only this retry path.
///
/// Concurrent calls collapse into the single in-flight request, same as
/// [RegistrationSync].
class InterestsSync {
  InterestsSync._();

  static Future<bool>? _inFlight;

  static bool get isPending => Session.instance.interestsSyncPending;

  /// Confirms the current local interests with the server if a sync is
  /// pending. Returns true once confirmed (immediately if nothing was
  /// pending, or as the result of this attempt); false while still pending.
  static Future<bool> retry() {
    if (!Session.instance.interestsSyncPending) return Future.value(true);
    if (!Session.instance.registered) return Future.value(false);
    return _inFlight ??= _attempt().whenComplete(() => _inFlight = null);
  }

  static Future<bool> _attempt() async {
    final ids = Session.instance.interests;
    try {
      await Api.patchMe({'interests': ids});
      // The PATCH round-tripped successfully with exactly the interests we
      // intended — confirm those, not whatever Session.interests holds by
      // the time this completes (a newer local edit may already be pending
      // again, and that one still needs its own sync).
      if (listEquals(Session.instance.interests, ids)) {
        await Session.instance.confirmInterestsSynced(ids);
      }
      return true;
    } catch (_) {
      return false; // still offline / server unreachable — try again later
    }
  }

  static bool listEquals(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
