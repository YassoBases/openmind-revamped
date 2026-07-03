import 'package:flutter/material.dart';

import '../learn_models.dart';
import 'triangle_planner.dart';

/// What a manipulative reports upward so the step engine can gate progress.
class LearnWidgetStatus {
  const LearnWidgetStatus({this.interacted = false, this.targetMet = false, this.detail});

  /// The student changed something (unlocks "explore" steps).
  final bool interacted;

  /// The step's target condition currently holds (unlocks "challenge" steps).
  final bool targetMet;

  /// Human-readable interaction state (e.g. "القاعدة=6، الارتفاع=4،
  /// المساحة=12") — sent as context when the student asks the tutor for help.
  final String? detail;
}

typedef LearnWidgetStatusCallback = void Function(LearnWidgetStatus status);

typedef LearnWidgetBuilder = Widget Function(
  LearnWidgetSpec spec,
  LearnWidgetStatusCallback onStatus,
);

/// type → builder. Adding a manipulative (number line, grid, scale…) means
/// registering it here; experiences select it by `widget.type` in JSON.
final Map<String, LearnWidgetBuilder> kLearnWidgetBuilders = {
  'triangle_area': (spec, onStatus) =>
      TrianglePlanner(spec: spec, onStatus: onStatus),
};

/// Resolves a widget spec, falling back to a visible error card so a typo in
/// content never crashes the player.
Widget buildLearnWidget(LearnWidgetSpec spec, LearnWidgetStatusCallback onStatus) {
  final builder = kLearnWidgetBuilders[spec.type];
  if (builder == null) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text('Unknown widget type: ${spec.type}'),
      ),
    );
  }
  return builder(spec, onStatus);
}
