import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../core/stage.dart';

/// The middle-school context lens picker — a lightweight bottom sheet, not a
/// path, subject, onboarding step, or tab. Selection is saved locally first
/// (instant, offline-safe) and PATCHed to the backend so it follows the
/// student across devices and reaches the tutor server-side.
///
/// Returns true when the selection changed, so openers can refresh.
Future<bool> showContextSheet(BuildContext context) async {
  final changed = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (_) => const _ContextSheet(),
  );
  return changed ?? false;
}

/// Emoji for a lens id (chips on Home/Me). Falls back to a neutral sparkle.
String contextEmoji(String? id) =>
    kLearningContexts.where((c) => c.id == id).map((c) => c.emoji).firstOrNull ?? '✨';

class _ContextSheet extends StatefulWidget {
  const _ContextSheet();

  @override
  State<_ContextSheet> createState() => _ContextSheetState();
}

class _ContextSheetState extends State<_ContextSheet> {
  String? _selected = Session.instance.learningContext;
  bool _saving = false;

  Future<void> _pick(String? id) async {
    if (_saving) return;
    setState(() {
      _selected = id;
      _saving = true;
    });
    final before = Session.instance.learningContext;
    // Local first: the UI and lessons see the lens immediately, even offline.
    await Session.instance.setLearningContext(id);
    // Best-effort server save — the trusted copy the tutor reads.
    if (Session.instance.registered) {
      try {
        final student = await Api.patchMe({'learningContext': id});
        await Session.instance.applyStudentView(student);
      } catch (_) {/* offline — local cache stands, next PATCH reconciles */}
    }
    if (mounted) Navigator.of(context).pop(before != id);
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
              l.translate('ctx_sheet_title'),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              l.translate('ctx_sheet_sub'),
              style: TextStyle(fontSize: 13.5, height: 1.6, color: cs.onSurfaceVariant),
            ),
            const SizedBox(height: 14),
            for (final ctx in kLearningContexts)
              _option(
                emoji: ctx.emoji,
                label: l.translate('ctx_${ctx.id}'),
                selected: _selected == ctx.id,
                onTap: () => _pick(ctx.id),
              ),
            _option(
              emoji: '⚪',
              label: l.translate('ctx_none'),
              selected: _selected == null,
              onTap: () => _pick(null),
            ),
          ],
        ),
      ),
    );
  }

  Widget _option({
    required String emoji,
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
            color: selected ? cs.primary.withValues(alpha: 0.08) : null,
            border: Border.all(
              color: selected ? cs.primary : cs.outlineVariant,
              width: selected ? 1.8 : 1,
            ),
            borderRadius: BorderRadius.circular(Palette.radiusButton),
          ),
          child: Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 20)),
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
              if (selected) Icon(Icons.check_circle_rounded, color: cs.primary, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
