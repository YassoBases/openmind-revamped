import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../widgets/candy_button.dart';
import '../../widgets/mascot.dart';
import '../../widgets/stat_widgets.dart';
import '../player/player_screen.dart';

/// The composer: subject, free-text topic, game type with visual previews,
/// theme, session length, difficulty → POST /games → instant tutorial play
/// while the spec generates (progressive start). Handles the normalizer's
/// single clarifying question inline.
class ComposerScreen extends StatefulWidget {
  const ComposerScreen({super.key});

  @override
  State<ComposerScreen> createState() => _ComposerScreenState();
}

class _ComposerScreenState extends State<ComposerScreen> {
  final _topic = TextEditingController();
  String? _subject;
  String _gameType = 'quest_path';
  String _theme = 'fantasy';
  int _sessionLength = 5;
  String _difficulty = 'normal';
  bool _busy = false;
  String? _clarify;

  static const _subjects = [
    'Science', 'Biology', 'Chemistry', 'Physics', 'Mathematics',
    'History', 'Geography', 'Languages', 'Art', 'Other',
  ];

  Future<void> _create() async {
    final topic = _topic.text.trim();
    if (topic.isEmpty) return;
    setState(() {
      _busy = true;
      _clarify = null;
    });
    try {
      final res = await Api.createGame({
        // subject is optional server-side; omit it entirely when unset
        // (the schema accepts absent-or-string, not an explicit null).
        if (_subject != null) 'subject': _subject,
        'topic': topic,
        'gameType': _gameType,
        'theme': _theme,
        'sessionLength': _sessionLength,
        'difficulty': _difficulty,
        'language': Session.instance.language,
      });
      if (!mounted) return;
      if (res['status'] == 'clarify') {
        setState(() {
          _busy = false;
          _clarify = res['clarifyingQuestion'] as String?;
        });
        return;
      }
      // Progressive start: open the shell with the stub IMMEDIATELY.
      final feedback = await Navigator.push<Map<String, dynamic>>(
        context,
        MaterialPageRoute(
          builder: (_) => PlayerScreen(
            launch: PlayerLaunch.generated(
              gameId: res['gameId'] as String,
              stubSpec: (res['stubSpec'] as Map).map((k, v) => MapEntry(k.toString(), v)),
            ),
          ),
        ),
      );
      if (!mounted) return;
      Navigator.pop(context, feedback);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(tr(context, 'connectionFail'))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final accent = hexToColor(Session.instance.color);
    final themes = kThemesByGame[_gameType]!;
    if (!themes.contains(_theme)) _theme = themes.first;

    return Scaffold(
      backgroundColor: Palette.dark,
      appBar: AppBar(
        backgroundColor: Palette.dark,
        title: Text(tr(context, 'createGame'), style: const TextStyle(color: Palette.soft)),
        iconTheme: const IconThemeData(color: Palette.grey),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _label('subject'),
          DropdownButtonFormField<String>(
            initialValue: _subject,
            dropdownColor: Palette.card,
            style: const TextStyle(color: Palette.soft),
            decoration: _inputDecoration(),
            items: [
              for (final s in _subjects)
                DropdownMenuItem(value: s, child: Text(s)),
            ],
            onChanged: (v) => setState(() => _subject = v),
          ),
          const SizedBox(height: 16),
          _label('topic'),
          TextField(
            controller: _topic,
            maxLength: 200,
            style: const TextStyle(color: Palette.soft, fontSize: 17),
            decoration: _inputDecoration(hint: tr(context, 'topicHint')),
          ),
          if (_clarify != null) ...[
            EduCard(
              color: const Color(0xFF2A3A1F),
              child: Row(children: [
                const Mascot(size: 48, expression: MascotExpression.thinking),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tr(context, 'clarifyTitle'),
                        style: const TextStyle(
                            color: Palette.yellow, fontWeight: FontWeight.w800, fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(_clarify!, style: const TextStyle(color: Palette.soft)),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),
          _label('gameType'),
          Row(children: [
            for (final gt in kGameTypes)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: _gameTypeCard(gt, accent),
                ),
              ),
          ]),
          const SizedBox(height: 16),
          _label('theme'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in themes)
              _pill('${kThemeEmoji[t] ?? ''} $t', _theme == t, accent, () => setState(() => _theme = t)),
          ]),
          const SizedBox(height: 16),
          _label('sessionLength'),
          Wrap(spacing: 8, children: [
            _pill('${tr(context, 'short')} • 3', _sessionLength == 3, accent, () => setState(() => _sessionLength = 3)),
            _pill('${tr(context, 'medium')} • 5', _sessionLength == 5, accent, () => setState(() => _sessionLength = 5)),
            _pill('${tr(context, 'long')} • 7', _sessionLength == 7, accent, () => setState(() => _sessionLength = 7)),
          ]),
          const SizedBox(height: 16),
          _label('difficulty'),
          Wrap(spacing: 8, children: [
            for (final d in ['easy', 'normal', 'hard'])
              _pill(tr(context, d), _difficulty == d, accent, () => setState(() => _difficulty = d)),
          ]),
          const SizedBox(height: 28),
          CandyButton(
            label: _busy ? '…' : tr(context, 'generate'),
            color: accent,
            height: 60,
            fontSize: 18,
            enabled: !_busy,
            icon: Icons.auto_awesome_rounded,
            onTap: _create,
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _label(String key) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(tr(context, key),
            style: const TextStyle(
                color: Palette.grey, fontWeight: FontWeight.w800, fontSize: 13)),
      );

  InputDecoration _inputDecoration({String? hint}) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Palette.cardBorder),
        counterText: '',
        filled: true,
        fillColor: Palette.card,
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(Palette.radiusInput),
            borderSide: BorderSide.none),
      );

  Widget _gameTypeCard(String gt, Color accent) {
    final selected = _gameType == gt;
    final names = {
      'quest_path': 'Quest\nPath', 'goal_shootout': 'Goal\nShootout', 'draw_connect': 'Draw &\nConnect',
    };
    return GestureDetector(
      onTap: () => setState(() => _gameType = gt),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: 0.2) : Palette.card,
          borderRadius: BorderRadius.circular(Palette.radiusCard),
          border: Border.all(color: selected ? accent : Palette.cardBorder, width: 2),
        ),
        child: Column(children: [
          Text(kGameTypeEmoji[gt]!, style: const TextStyle(fontSize: 30)),
          const SizedBox(height: 6),
          Text(names[gt]!,
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: selected ? Palette.soft : Palette.grey,
                  fontWeight: FontWeight.w800,
                  fontSize: 12)),
        ]),
      ),
    );
  }

  Widget _pill(String label, bool selected, Color accent, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: 0.22) : Palette.card,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: selected ? accent : Palette.cardBorder, width: 2),
        ),
        child: Text(label,
            style: TextStyle(
                color: selected ? Palette.soft : Palette.grey, fontWeight: FontWeight.w700, fontSize: 13)),
      ),
    );
  }
}
