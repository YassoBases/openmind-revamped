import 'package:flutter/material.dart';

import '../../app_localizations.dart';
import '../../core/api_client.dart';
import '../../core/palette.dart';
import '../../core/session.dart';
import '../../widgets/mascot.dart';
import 'primary_catalog.dart';
import 'world_map_screen.dart';
import 'world_models.dart';
import 'world_store.dart';

/// Where a new world begins: the child's OWN grade's curated lessons
/// (math + science), plus a free-topic field for anything beyond the catalog.
/// Both paths create the same stage-map world. One warm building moment
/// covers the single combined plan+stage-1 call — after that, stages are
/// prefetched during play and the world never shows a wait again.
class LessonPickerScreen extends StatefulWidget {
  const LessonPickerScreen({super.key});

  @override
  State<LessonPickerScreen> createState() => _LessonPickerScreenState();
}

class _LessonPickerScreenState extends State<LessonPickerScreen> {
  List<PrimaryCatalog> _catalogs = const [];
  final _topicController = TextEditingController();
  bool _creating = false;
  String? _clarify;

  int get _grade => (Session.instance.profile?['grade'] as num?)?.toInt() ?? 1;

  @override
  void initState() {
    super.initState();
    PrimaryCatalogLoader.load(_grade, Session.instance.language).then((c) {
      if (mounted) setState(() => _catalogs = c);
    });
  }

  @override
  void dispose() {
    _topicController.dispose();
    super.dispose();
  }

  Future<void> _create({PrimaryLesson? lesson, String? subject}) async {
    if (_creating) return;
    final topic = lesson?.title ?? _topicController.text.trim();
    if (topic.isEmpty) return;
    setState(() {
      _creating = true;
      _clarify = null;
    });
    try {
      final res = await Api.createWorld({
        'topic': topic,
        if (subject != null) 'subject': subject,
        if (lesson != null) 'lessonId': lesson.id,
        if (lesson != null && lesson.focusConcepts.isNotEmpty)
          'focusConcepts': lesson.focusConcepts,
      });
      if (res['status'] == 'clarify') {
        setState(() {
          _creating = false;
          _clarify = res['clarifyingQuestion'] as String?;
        });
        return;
      }

      // Persist the world + its ready-to-play stage 1, then open the map.
      final store = await WorldStore.instance();
      final world = await store.save(World.fromMap({
        ...(res['world'] as Map).cast<String, dynamic>(),
        'stages': res['stages'],
      }));
      final stage1 = (res['stage1Spec'] as Map?)?.cast<String, dynamic>();
      if (stage1 != null) await store.saveStageSpec(world.id, 1, stage1);

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => WorldMapScreen(worldId: world.id)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _creating = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'connectionFail'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    if (_creating) {
      return Scaffold(
        backgroundColor: Palette.dark,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Mascot(expression: MascotExpression.thinking, size: 130),
              const SizedBox(height: 18),
              Text(
                l.translate('world_building'),
                style: const TextStyle(
                  color: Palette.soft,
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 20),
              const SizedBox(
                width: 40,
                height: 40,
                child: CircularProgressIndicator(color: Palette.yellow, strokeWidth: 3),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Palette.dark,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Palette.soft,
        title: Text(l.translate('world_new'),
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_clarify != null)
              Container(
                padding: const EdgeInsets.all(14),
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: Palette.card,
                  borderRadius: BorderRadius.circular(Palette.radiusCard),
                  border: Border.all(color: Palette.yellow),
                ),
                child: Row(
                  children: [
                    const Mascot(expression: MascotExpression.happy, size: 54),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(_clarify!,
                          style: const TextStyle(color: Palette.soft, fontSize: 15)),
                    ),
                  ],
                ),
              ),
            for (final catalog in _catalogs) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: 8, top: 6),
                child: Text(
                  catalog.subjectTitle,
                  style: const TextStyle(
                    color: Palette.yellow,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              for (final lesson in catalog.lessons)
                Card(
                  color: Palette.card,
                  margin: const EdgeInsets.only(bottom: 8),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(Palette.radiusButton),
                    side: const BorderSide(color: Palette.cardBorder),
                  ),
                  child: ListTile(
                    title: Text(lesson.title,
                        style: const TextStyle(
                            color: Palette.soft, fontWeight: FontWeight.w700)),
                    trailing: const Icon(Icons.auto_awesome_rounded,
                        color: Palette.yellow, size: 20),
                    onTap: () =>
                        _create(lesson: lesson, subject: catalog.subjectTitle),
                  ),
                ),
            ],
            const SizedBox(height: 14),
            Text(
              l.translate('world_own_topic'),
              style: const TextStyle(
                color: Palette.yellow,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _topicController,
              maxLength: 200,
              style: const TextStyle(color: Palette.soft),
              decoration: InputDecoration(
                hintText: l.translate('world_own_topic_hint'),
                hintStyle: const TextStyle(color: Palette.grey),
                counterText: '',
                filled: true,
                fillColor: Palette.card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(Palette.radiusInput),
                  borderSide: const BorderSide(color: Palette.cardBorder),
                ),
              ),
              onSubmitted: (_) => _create(),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: Palette.green,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(Palette.radiusButton),
                  ),
                ),
                onPressed: () => _create(),
                child: Text(
                  l.translate('world_create'),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
