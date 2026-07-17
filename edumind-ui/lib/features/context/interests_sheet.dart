import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../onboarding/onboarding_flow.dart' show kOnbInterests;

/// Lets a student change their personal interests (1-2, both stages) after
/// onboarding — the same signal AI explanations, examples and activities
/// draw from. A lightweight bottom sheet: local-first save, then a
/// best-effort server PATCH.
///
/// Localized, comma-joined labels for the student's current interests (chip
/// subtitle on Me/Profile). Empty selection falls back to `int_none`.
String interestsSummary(AppLocalizations l, List<String> ids) {
  if (ids.isEmpty) return l.translate('int_none');
  return ids.map((id) => interestLabel(l, id)).join(', ');
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
    setState(() => _saving = true);
    final ids = _selected.toList();
    final before = Session.instance.interests;
    // Local first: the UI and the tutor see the new interests immediately,
    // even offline.
    await Session.instance.setInterests(ids);
    // Best-effort server save — the trusted copy the tutor reads.
    if (Session.instance.registered) {
      try {
        final student = await Api.patchMe({'interests': ids});
        await Session.instance.applyStudentView(student);
      } catch (_) {/* offline — local cache stands, next PATCH reconciles */}
    }
    if (mounted) {
      final changed = before.length != ids.length || !before.toSet().containsAll(ids);
      Navigator.of(context).pop(changed);
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
