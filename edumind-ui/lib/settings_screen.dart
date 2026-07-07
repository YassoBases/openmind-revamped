import 'package:flutter/material.dart';

import 'app_localizations.dart';
import 'core/api_client.dart';
import 'core/app_theme.dart';
import 'core/session.dart';
import 'features/demos/demos_screen.dart';
import 'languageswitchertile.dart';

/// Settings: language selector, theme, and the backend server address (so a
/// physical device can point at a laptop's LAN IP without rebuilding). Fully
/// bilingual via AppLocalizations; direction follows the app locale.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _url = TextEditingController(
    text: Session.instance.baseUrl,
  );
  String? _status;
  bool? _ok;
  bool _testing = false;

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _test() async {
    final l = AppLocalizations.of(context)!;
    setState(() {
      _testing = true;
      _status = null;
    });
    await Session.instance.setBaseUrl(_url.text);
    final health = await Api.health();
    if (!mounted) return;
    setState(() {
      _testing = false;
      _ok = health != null;
      _status = health != null
          ? '${l.translate('connection_ok')}  (db: ${health['db']}, llm: ${health['llm']})'
          : l.translate('connection_fail');
    });
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l.translate('settings'))),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: const LanguageSwitcherTile(),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: Icon(Icons.sports_esports_rounded, color: cs.secondary),
              title: Text(
                l.translate('demo_games'),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              subtitle: Text(l.translate('demo_games_sub')),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute<void>(builder: (_) => const DemosScreen()),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            l.translate('server_address'),
            style: TextStyle(
              color: cs.onSurfaceVariant,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            style: const TextStyle(fontFamily: 'monospace'),
            decoration: const InputDecoration(
              hintText: 'http://192.168.1.50:8080',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _testing ? null : _test,
            icon: _testing
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.wifi_tethering_rounded),
            label: Text(l.translate('test_connection')),
          ),
          if (_status != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: (_ok! ? AppColors.mutedGreen : cs.error).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _ok! ? AppColors.mutedGreen : cs.error),
              ),
              child: Row(
                children: [
                  Icon(
                    _ok! ? Icons.check_circle_rounded : Icons.refresh_rounded,
                    size: 18,
                    color: _ok! ? AppColors.mutedGreen : cs.error,
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_status!)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 26),
          Text(
            l.translate('privacy_note'),
            style: TextStyle(
              color: cs.onSurfaceVariant.withValues(alpha: 0.8),
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
