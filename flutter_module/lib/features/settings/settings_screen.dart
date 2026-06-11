import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../widgets/candy_button.dart';
import '../demos/demos_screen.dart';

/// Settings: the server address field + Test Connection button — this is how
/// a physical phone points at the laptop's LAN IP without rebuilding the app.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _url =
      TextEditingController(text: Session.instance.baseUrl);
  String? _status;
  bool? _ok;
  bool _testing = false;

  Future<void> _test() async {
    setState(() {
      _testing = true;
      _status = null;
    });
    await Session.instance.setBaseUrl(_url.text);
    final health = await Api.health();
    setState(() {
      _testing = false;
      _ok = health != null;
      _status = health != null
          ? '${tr(context, 'connectionOk')}  (db: ${health['db']}, llm: ${health['llm']})'
          : tr(context, 'connectionFail');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Palette.dark,
      appBar: AppBar(
        backgroundColor: Palette.dark,
        title: Text(tr(context, 'settings'), style: const TextStyle(color: Palette.soft)),
        iconTheme: const IconThemeData(color: Palette.grey),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(tr(context, 'serverAddress'),
              style: const TextStyle(color: Palette.grey, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            style: const TextStyle(color: Palette.soft, fontFamily: 'monospace'),
            decoration: InputDecoration(
              hintText: 'http://192.168.1.50:8080',
              hintStyle: const TextStyle(color: Palette.cardBorder),
              filled: true,
              fillColor: Palette.card,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Palette.radiusInput),
                  borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 14),
          CandyButton(
            label: _testing ? '…' : tr(context, 'testConnection'),
            color: Palette.blue,
            enabled: !_testing,
            onTap: _test,
          ),
          if (_status != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: (_ok! ? Palette.green : Palette.heart).withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(Palette.radiusButton),
                border: Border.all(color: _ok! ? Palette.green : Palette.heart),
              ),
              child: Text(_status!, style: const TextStyle(color: Palette.soft)),
            ),
          ],
          const SizedBox(height: 30),
          const Divider(color: Palette.cardBorder),
          const SizedBox(height: 10),
          // Demo Games — the offline debug surface (debug builds only).
          if (kDebugMode)
            ListTile(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Palette.radiusButton)),
              tileColor: Palette.card,
              leading: const Text('🎮', style: TextStyle(fontSize: 24)),
              title: Text(tr(context, 'demoGames'), style: const TextStyle(color: Palette.soft, fontWeight: FontWeight.w700)),
              subtitle: Text(tr(context, 'demoSub'), style: const TextStyle(color: Palette.grey, fontSize: 12)),
              onTap: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const DemosScreen())),
            ),
          const SizedBox(height: 18),
          Text(
            'OpenMind v4.1 — data minimization: nickname only, no email, no analytics. '
            'Gender (optional) is used exclusively for Arabic grammar.',
            style: TextStyle(color: Palette.grey.withValues(alpha: 0.7), fontSize: 12),
          ),
        ],
      ),
    );
  }
}
