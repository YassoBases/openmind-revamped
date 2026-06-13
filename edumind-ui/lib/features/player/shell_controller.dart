/// Host-side handle to a running shell: push the full spec when generation
/// finishes (progressive start) or signal failure (mascot apology + retry).
class ShellController {
  Future<void> Function(Map<String, dynamic> spec)? sendSpecImpl;
  Future<void> Function()? generationFailedImpl;

  Future<void> sendSpec(Map<String, dynamic> spec) async =>
      sendSpecImpl?.call(spec);

  Future<void> generationFailed() async => generationFailedImpl?.call();
}
