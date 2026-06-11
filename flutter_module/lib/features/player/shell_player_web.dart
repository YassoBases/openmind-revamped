import 'dart:js_interop';
import 'dart:ui_web' as ui_web;
import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;
import 'shell_controller.dart';

/// Web shell host: iframe with srcdoc (same assembly as native), bridge via
/// postMessage both ways — {source:'EduMind'} up, {source:'EduMindHost'} down.
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

int _viewSeq = 0;

class _ShellPlayerState extends State<ShellPlayer> {
  late final String _viewType;
  web.HTMLIFrameElement? _iframe;
  JSFunction? _listener;

  @override
  void initState() {
    super.initState();
    _viewType = 'edumind-shell-${_viewSeq++}';

    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int _) {
      final iframe = web.HTMLIFrameElement()
        ..srcdoc = widget.html.toJS
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.background = '#131F24';
      _iframe = iframe;
      return iframe;
    });

    void onMessage(web.MessageEvent event) {
      if (_iframe == null || event.source != _iframe!.contentWindow) return;
      final data = event.data.dartify();
      if (data is Map && data['source'] == 'EduMind') {
        widget.onBridge(data.map((k, v) => MapEntry(k.toString(), v)));
      }
    }

    _listener = onMessage.toJS;
    web.window.addEventListener('message', _listener);

    widget.controller.sendSpecImpl = (spec) async {
      _iframe?.contentWindow?.postMessage(
        {'source': 'EduMindHost', 'type': 'spec', 'payload': spec}.jsify(),
        '*'.toJS,
      );
    };
    widget.controller.generationFailedImpl = () async {
      _iframe?.contentWindow?.postMessage(
        {'source': 'EduMindHost', 'type': 'generationFailed'}.jsify(),
        '*'.toJS,
      );
    };
  }

  @override
  void dispose() {
    if (_listener != null) {
      web.window.removeEventListener('message', _listener);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => HtmlElementView(viewType: _viewType);
}
