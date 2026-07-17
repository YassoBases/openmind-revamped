import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/interests_sync.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../onboarding/onboarding_flow.dart' show kOnbInterests;

/// Lets a student change their personal interests (1-2, both stages) after
/// onboarding — the same signal AI explanations, examples and activities
/// draw from. A lightweight bottom sheet: local-first save, then a
/// best-effort server PATCH.
///
/// Localized, comma-joined labels for the student's current interests (chip
/// subtitle on Me/Profile). Empty selection falls back to `int_none`. When
/// [pending] is true (a save hasn't been confirmed by the server yet — see
/// [Session.interestsSyncPending]) a short "syncing" marker is appended, so
/// the subtitle never silently implies a save that hasn't landed.
String interestsSummary(AppLocalizations l, List<String> ids, {bool pending = false}) {
  final base = ids.isEmpty ? l.translate('int_none') : ids.map((id) => interestLabel(l, id)).join(', ');
  return pending ? '$base · ${l.translate('int_sync_pending_badge')}' : base;
}

/// The localized label for a single interest id (falls back to the raw id
/// if it's somehow not in [kOnbInterests]).
String interestLabel(AppLocalizations l, String id) =>
    kOnbInterests.where((it) => it.id == id).map((it) => l.translate(it.key)).firstOrNull ?? id;

/// Returns true when the selection changed, so openers can refresh.
Future<bool> showInterestsSheet(BuildContext context) async {
  final changed = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (_) => const _InterestsSheet(),
  );
  return changed ?? false;
}

class _InterestsSheet extends StatefulWidget {
  const _InterestsSheet();

  @override
  State<_InterestsSheet> createState() => _InterestsSheetState();
}

class _InterestsSheetState extends State<_InterestsSheet> {
  final Set<String> _selected = Session.instance.interests.toSet();
  bool _saving = false;

  /// The student's personal accent — a small touch on the selected chips
  /// and the Save CTA only, never the sheet's background or typography.
  Color get _accent => hexToColor(Session.instance.color);

  Future<void> _save() async {
    if (_saving || _selected.isEmpty) return;
    final l = AppLocalizations.of(context)!;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _saving = true);
    final ids = _selected.toList();
    final before = Session.instance.interests;
    // Local first: the UI sees the new interests immediately, even offline
    // — marked pending until the server confirms them.
    await Session.instance.setInterests(ids);
    // Best-effort server confirm. Ask Hudhud only ever reasons from the
    // server's copy of interests (it reads the authenticated student row,
    // never the request body) — so this PATCH is what actually makes the
    // new pick count, not the local write above. A failure here is never
    // reported as success: it leaves the pick pending (surfaced next to the
    // interests summary on Profile/Me, see [Session.interestsSyncPending])
    // for [InterestsSync] to retry automatically.
    final synced = Session.instance.registered && await InterestsSync.retry();
    if (!mounted) return;
    final changed = before.length != ids.length || !before.toSet().containsAll(ids);
    Navigator.of(context).pop(changed);
    if (!synced) {
      messenger.showSnackBar(SnackBar(content: Text(l.translate('int_sync_pending_toast'))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l.translate('int_sheet_title'),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              l.translate('int_sheet_sub'),
              style: TextStyle(fontSize: 13.5, height: 1.6, color: cs.onSurfaceVariant),
            ),
            const SizedBox(height: 14),
            // Scrollable so seven options + Save never overflow a short phone.
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final it in kOnbInterests)
                      _option(
                        icon: it.icon,
                        label: l.translate(it.key),
                        selected: _selected.contains(it.id),
                        onTap: () => setState(() {
                          if (_selected.contains(it.id)) {
                            _selected.remove(it.id);
                          } else if (_selected.length < 2) {
                            _selected.add(it.id);
                          }
                        }),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton(
              onPressed: _selected.isEmpty || _saving ? null : _save,
              style: FilledButton.styleFrom(
                backgroundColor: _accent,
                foregroundColor: onAccentColor(_accent),
              ),
              child: Text(l.translate('int_sheet_save')),
            ),
          ],
        ),
      ),
    );
  }

  Widget _option({
    required IconData icon,
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(Palette.radiusButton),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? _accent.withValues(alpha: 0.08) : null,
            border: Border.all(
              color: selected ? _accent : cs.outlineVariant,
              width: selected ? 1.8 : 1,
            ),
            borderRadius: BorderRadius.circular(Palette.radiusButton),
          ),
          child: Row(
            children: [
              Icon(icon, size: 20, color: selected ? _accent : cs.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  ),
                ),
              ),
              if (selected) Icon(Icons.check_circle_rounded, color: _accent, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
