import 'package:flutter/material.dart';

import '../../about_screen.dart';
import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../languageswitchertile.dart';
import '../context/context_sheet.dart';
import '../learn/journey_logic.dart';
import '../learn/learn_catalog.dart';
import '../learn/learn_progress_store.dart';

/// "أنا" — the middle-school Me tab: identity, real learning stats, the
/// context lens, and the merged settings/about entries. Profile + Settings +
/// About collapsed into one calm screen; no elementary games surface here.
class MeScreen extends StatefulWidget {
  const MeScreen({super.key});

  @override
  State<MeScreen> createState() => _MeScreenState();
}

class _MeScreenState extends State<MeScreen> {
  int _experiencesDone = 0;
  int _pathsDone = 0;
  int _pathsTotal = 0;

  final _url = TextEditingController(text: Session.instance.baseUrl);
  String? _connStatus;
  bool _testing = false;

  @override
  void initState() {
    super.initState();
    _load();
    LearnProgressStore.revision.addListener(_onProgressChanged);
  }

  @override
  void dispose() {
    LearnProgressStore.revision.removeListener(_onProgressChanged);
    _url.dispose();
    super.dispose();
  }

  void _onProgressChanged() {
    if (mounted) _load();
  }

  Future<void> _load() async {
    final catalogs = await LearnCatalogLoader.catalogs(
      language: Session.instance.language,
      grade: Session.instance.grade,
    );
    final store = await LearnProgressStore.load();
    final completed = store.completed;
    var pathsDone = 0, pathsTotal = 0;
    // Only real experiences count as "experiences completed" — checkpoint
    // completions and legacy/stale keys share the same store but are not
    // experiences the student finished.
    final experienceKeys = <String>{};
    for (final c in catalogs) {
      for (final p in c.paths) {
        pathsTotal++;
        final (done, ready) = pathProgress(p, completed);
        if (ready > 0 && done == ready) pathsDone++;
        for (final e in p.experiences) {
          experienceKeys.add('${p.id}/${e.id}');
        }
      }
    }
    if (mounted) {
      setState(() {
        _experiencesDone = completed.where(experienceKeys.contains).length;
        _pathsDone = pathsDone;
        _pathsTotal = pathsTotal;
      });
    }
  }

  Future<void> _testConnection() async {
    final l = AppLocalizations.of(context)!;
    setState(() {
      _testing = true;
      _connStatus = null;
    });
    await Session.instance.setBaseUrl(_url.text);
    final health = await Api.health();
    if (!mounted) return;
    setState(() {
      _testing = false;
      _connStatus = health != null
          ? '${l.translate('connection_ok')}  (db: ${health['db']}, llm: ${health['llm']})'
          : l.translate('connection_fail');
    });
  }

  String _gradeLabel(AppLocalizations l, int grade) => switch (grade) {
        5 => l.translate('grade_5'),
        6 => l.translate('grade_6'),
        7 => l.translate('grade_7'),
        8 => l.translate('grade_8'),
        9 => l.translate('grade_9'),
        _ => '${l.translate('profile_grade')} $grade',
      };

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final name = Session.instance.name;
    final lens = Session.instance.learningContext;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
          children: [
            Text(
              l.translate('me_title'),
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 16),
            // Identity — real data only: nickname, true grade, stage.
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: cs.primary.withValues(alpha: 0.15),
                      child: Text(
                        name.isEmpty ? '؟' : name.characters.first,
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          color: cs.primary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            children: [
                              _chip(cs, _gradeLabel(l, Session.instance.grade)),
                              _chip(cs, l.translate('me_stage_middle')),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            // Real learning stats — from the learn-progress domain, not games.
            Row(
              children: [
                Expanded(
                  child: _statCard(
                    cs,
                    icon: Icons.flag_rounded,
                    value: '$_experiencesDone',
                    label: l.translate('me_experiences_done'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _statCard(
                    cs,
                    icon: Icons.route_rounded,
                    value: '$_pathsDone/$_pathsTotal',
                    label: l.translate('me_paths_done'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Card(
              child: ListTile(
                leading: Text(contextEmoji(lens), style: const TextStyle(fontSize: 22)),
                title: Text(
                  l.translate('ctx_chip_label'),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: Text(
                  lens == null ? l.translate('ctx_none') : l.translate('ctx_$lens'),
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () async {
                  if (await showContextSheet(context) && mounted) setState(() {});
                },
              ),
            ),
            const SizedBox(height: 12),
            // One calm settings group: language, appearance, about.
            Card(
              child: Column(
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                    child: LanguageSwitcherTile(),
                  ),
                  Divider(height: 1, indent: 16, endIndent: 16, color: cs.outlineVariant),
                  ListTile(
                    leading: Icon(Icons.info_outline_rounded, color: cs.primary),
                    title: Text(
                      l.translate('nav_about'),
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const AboutScreen()),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            // Advanced: the backend address (kept from Settings — a phone can
            // point at a laptop's LAN IP without rebuilding).
            Card(
              child: ExpansionTile(
                leading: Icon(Icons.dns_rounded, color: cs.onSurfaceVariant),
                title: Text(
                  l.translate('me_advanced'),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                children: [
                  Text(
                    l.translate('server_address'),
                    style: TextStyle(color: cs.onSurfaceVariant, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _url,
                    keyboardType: TextInputType.url,
                    style: const TextStyle(fontFamily: 'monospace'),
                    decoration: const InputDecoration(hintText: 'http://192.168.1.50:8080'),
                  ),
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    onPressed: _testing ? null : _testConnection,
                    icon: _testing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.wifi_tethering_rounded),
                    label: Text(l.translate('test_connection')),
                  ),
                  if (_connStatus != null) ...[
                    const SizedBox(height: 8),
                    Text(_connStatus!, style: const TextStyle(fontSize: 13)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(ColorScheme cs, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: cs.primary.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: cs.primary.withValues(alpha: 0.4)),
        ),
        child: Text(
          text,
          style: TextStyle(color: cs.primary, fontWeight: FontWeight.w800, fontSize: 13),
        ),
      );

  Widget _statCard(ColorScheme cs,
      {required IconData icon, required String value, required String label}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(Palette.radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: cs.primary),
          const SizedBox(height: 8),
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          Text(label, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        ],
      ),
    );
  }
}
