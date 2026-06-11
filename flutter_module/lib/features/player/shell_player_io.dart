import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'shell_controller.dart';

/// Native (Android/iOS) shell host: webview_flutter + loadHtmlString.
/// Bridge: the shells post to window.EduMind.postMessage (JS channel);
/// the host pushes the spec via EduCore.receiveSpec(...) (runJavaScript).
class ShellPlayer extends StatefulWidget {
  const ShellPlayer({
    super.key,
    required this.html,
    required this.onBridge,
    required this.controller,
  });

  final String html;
  final void Function(Map<String, dynamic> message) onBridge;
  final ShellController controller;

  @override
  State<ShellPlayer> createState() => _ShellPlayerState();
}

class _ShellPlayerState extends State<ShellPlayer> {
  late final WebViewController _web;

  // JSON is a valid JS literal except U+2028/U+2029 - escape those.
  String _jsLiteral(Map<String, dynamic> obj) => jsonEncode(obj)
      .replaceAll(' ', '\\u2028')
      .replaceAll(' ', '\\u2029');

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF131F24))
      ..addJavaScriptChannel('EduMind', onMessageReceived: (msg) {
        try {
          final data = jsonDecode(msg.message) as Map<String, dynamic>;
          widget.onBridge(data);
        } catch (_) {/* malformed bridge message — ignore */}
      })
      ..loadHtmlString(widget.html);

    widget.controller.sendSpecImpl = (spec) =>
        _web.runJavaScript('window.EduCore && EduCore.receiveSpec(${_jsLiteral(spec)});');
    widget.controller.generationFailedImpl =
        () => _web.runJavaScript('window.EduCore && EduCore.generationFailed();');
  }

  @override
  Widget build(BuildContext context) => WebViewWidget(controller: _web);
}
