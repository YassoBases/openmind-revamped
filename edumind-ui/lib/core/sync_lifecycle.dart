import 'package:flutter/widgets.dart';

/// Runs [onSync] once when first mounted (app startup / cold start) and
/// again every time the app returns to the foreground
/// (`didChangeAppLifecycleState` → resumed) — the two moments a pending
/// registration or interests sync ([RegistrationSync], [InterestsSync])
/// should retry automatically, without the learner having to do anything.
///
/// Factored out of [EduMindRoot] as its own widget specifically so this
/// wiring — not the rest of the app shell's screen tree — can be exercised
/// directly in tests.
class SyncOnStartupAndResume extends StatefulWidget {
  const SyncOnStartupAndResume({super.key, required this.onSync, required this.child});

  final Future<void> Function() onSync;
  final Widget child;

  @override
  State<SyncOnStartupAndResume> createState() => _SyncOnStartupAndResumeState();
}

class _SyncOnStartupAndResumeState extends State<SyncOnStartupAndResume>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.onSync();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// A returning foreground is the app's best signal that connectivity may
  /// just have come back.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) widget.onSync();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
