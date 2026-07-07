import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/session.dart';
import '../../edumind_root.dart';
import '../../widgets/mascot.dart';
import '../onboarding/onboarding_flow.dart';

/// Shown once per cold start when a saved device account exists. The real
/// backend auth contract is a device token minted at onboarding — no email,
/// no password, no lookup-by-name — so "login" here is a session restore:
/// one tap verifies the stored token against `GET /students/me` before
/// entering the app, rather than silently trusting a possibly-stale token.
class WelcomeBackScreen extends StatefulWidget {
  const WelcomeBackScreen({super.key});

  @override
  State<WelcomeBackScreen> createState() => _WelcomeBackScreenState();
}

class _WelcomeBackScreenState extends State<WelcomeBackScreen> {
  bool _checking = false;

  Future<void> _continue() async {
    final l = AppLocalizations.of(context)!;
    setState(() => _checking = true);
    try {
      final student = await Api.me();
      await Session.instance.applyStudentView(student);
      _goTo(const EduMindRoot());
    } on ApiException catch (e) {
      if (e.status == 401) {
        // The only real failure mode: the server no longer knows this
        // token. There is no password to recover it with — the honest next
        // step is a fresh account, same as any new learner. Clear only the
        // dead credentials: the learner's local profile, learning progress
        // and completed lessons are never touched by this.
        await Session.instance.clearAuth();
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(l.translate('welcome_back_expired'))));
        }
        await Future<void>.delayed(const Duration(milliseconds: 900));
        _goTo(const OnboardingFlow());
      } else {
        // Server reachable but something else went wrong — don't strand the
        // learner behind a broken gate; the cached profile still works.
        _goTo(const EduMindRoot());
      }
    } catch (_) {
      // Offline: same graceful fallback as first-run offline (ProfileBridge)
      // — everything works except live generation.
      _goTo(const EduMindRoot());
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  void _goTo(Widget page) {
    if (!mounted) return;
    Navigator.of(context)
        .pushReplacement<void, void>(MaterialPageRoute<void>(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Mascot(size: 120, accent: cs.primary, expression: MascotExpression.happy),
                const SizedBox(height: 20),
                Text(
                  l.translateWith('welcome_back_title', {'name': Session.instance.name}),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                Text(
                  l.translate('welcome_back_sub'),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15, height: 1.7, color: cs.onSurfaceVariant),
                ),
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: _checking ? null : _continue,
                  style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 52)),
                  child: _checking
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            ),
                            const SizedBox(width: 10),
                            Text(l.translate('welcome_back_checking')),
                          ],
                        )
                      : Text(
                          l.translate('welcome_back_continue'),
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
