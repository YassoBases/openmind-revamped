/**
 * Interact.js — shared touch-interaction primitives for the EduMind shells.
 *
 * Extracted from draw_connect's pointer machinery so every manipulation
 * mechanic (drag-to-connect, drag-and-collect, sequence slots, scene taps)
 * builds on one tested state machine instead of re-implementing pointer
 * handling per game. Evaluation stays 100% programmatic in the caller —
 * these helpers only own the touch lifecycle.
 *
 * One-finger only, touch-first, no multi-touch gestures (same rules as the
 * rest of the shells). Touch targets are floored at 44px like candyButton.
 */
(function () {
  'use strict';

  const TOUCH_MIN = 44; // px — same floor GameFeel enforces on buttons

  /**
   * Nearest entry of `items` to (x, y) within `radius`, or null.
   * getPos(item) -> {x, y}; defaults to the item itself.
   */
  function nearest(items, x, y, radius, getPos) {
    const pos = getPos || ((it) => it);
    let best = null;
    let bestD = radius;
    for (const it of items) {
      const p = pos(it);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * One-finger drag state machine on a scene.
   *
   * opts:
   *   findTarget(x, y)        -> grabbable | null (called on pointerdown)
   *   onGrab(target, pointer)      — drag started on a target
   *   onMove(pointer, points, start) — finger moved (points = sampled polyline)
   *   onDrop(start, pointer, points) — finger lifted (start = grabbed target)
   *   sampleDist (px, default 7), maxPoints (default 240)
   *
   * Returns { enable(), disable(), enabled, dragging } — starts DISABLED so
   * callers opt in per question, mirroring draw_connect's drawingEnabled.
   */
  function attachDrag(scene, opts) {
    const o = opts || {};
    const sampleDist = o.sampleDist == null ? 7 : o.sampleDist;
    const maxPoints = o.maxPoints == null ? 240 : o.maxPoints;

    const state = {
      enabled: false,
      drag: null, // { start, points }
      enable() { state.enabled = true; },
      disable() { state.enabled = false; },
      get dragging() { return !!state.drag; },
    };

    scene.input.on('pointerdown', (pointer) => {
      if (!state.enabled || state.drag) return;
      const target = o.findTarget ? o.findTarget(pointer.x, pointer.y) : null;
      if (!target) return;
      state.drag = { start: target, points: [{ x: pointer.x, y: pointer.y }] };
      if (o.onGrab) o.onGrab(target, pointer);
    });

    scene.input.on('pointermove', (pointer) => {
      if (!state.drag) return;
      const pts = state.drag.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(pointer.x - last.x, pointer.y - last.y) > sampleDist && pts.length < maxPoints) {
        pts.push({ x: pointer.x, y: pointer.y });
      }
      if (o.onMove) o.onMove(pointer, pts, state.drag.start);
    });

    const finish = (pointer) => {
      if (!state.drag) return;
      const drag = state.drag;
      state.drag = null;
      if (o.onDrop) o.onDrop(drag.start, pointer, drag.points);
    };
    scene.input.on('pointerup', finish);
    scene.input.on('pointerupoutside', finish);

    return state;
  }

  /**
   * Make any container/game-object a tappable scene object with a floored
   * touch target and the standard press feedback. Unlike candyButton this
   * carries no chrome — it is for objects living IN the scene (a bird, a
   * brick, a number card), the tap-from-scene primitive.
   *
   * opts: { w, h (>=44 enforced), onTap(obj), wiggle (default true) }
   */
  function makeTappable(scene, obj, opts) {
    const o = opts || {};
    const w = Math.max(o.w || TOUCH_MIN, TOUCH_MIN);
    const h = Math.max(o.h || TOUCH_MIN, TOUCH_MIN);
    obj.setSize(w, h);
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', () => {
      if (obj.tapDisabled) return;
      if (o.wiggle !== false && scene.feel) scene.feel.wiggle(obj, 1.2);
      GameFeel.audio.tick();
    });
    obj.on('pointerup', () => {
      if (obj.tapDisabled) return;
      if (o.onTap) o.onTap(obj);
    });
    return obj;
  }

  window.Interact = { TOUCH_MIN, nearest, attachDrag, makeTappable };
})();
