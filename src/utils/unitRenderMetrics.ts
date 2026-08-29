/**
 * Unit & order rendering metrics — MIRROR of diplicity-react's production renderer.
 *
 * Source of truth:
 *   diplicity-react/packages/web/src/components/InteractiveMap/mapRenderer.ts
 *   (PR johnpooch/diplicity-react#1247, commit 1520002 "Scale outline strokes
 *   with unit/order size…")
 *
 * diplicity-react's `DiplicityMap` renderer multiplies every one of these
 * constants by the variant's `unitScaling` value (the `.dvar` `unitScaling`
 * field, 0.1–10, default 1) — unit tokens, order arrows, hold octagons, and
 * their outline strokes all scale linearly. Supply-center dots and
 * selection/highlight outlines are deliberately NOT scaled there (map chrome),
 * so they are not represented here.
 *
 * The dVAR Creator's Unit Scaling preview renders with these exact values so
 * that what a variant author sees at a given scale matches what diplicity-react
 * will draw. If diplicity-react changes a constant, update it here too —
 * `unitRenderMetrics.test.ts` pins the values and will fail until it is re-synced.
 */

// ─── Unit tokens ───────────────────────────────────────────────────────────────

/** Radius of the army/fleet circle. `mapRenderer.ts` UNIT_RADIUS. */
export const UNIT_RADIUS = 10;
/** Extra gap added to UNIT_RADIUS when an order line starts/ends at a unit. */
export const UNIT_OFFSET_RADIUS = 5;
/** Positional offset applied to a dislodged unit and its retreat markers. */
export const DISLODGED_OFFSET = 8;
/** `stroke-width` of the unit circle outline (scaled since commit 1520002). */
export const UNIT_STROKE_WIDTH = 2;
/** `font-size` of the "A"/"F" label inside the unit circle. */
export const UNIT_LABEL_FONT_SIZE = 15;
/**
 * Baseline drop of the "A"/"F" label from the circle centre. NOTE: in
 * `mapRenderer.ts` this `cy + 5` offset is applied *unscaled* (only the
 * font-size scales), so it is mirrored unscaled here.
 */
export const UNIT_LABEL_BASELINE_DY = 5;

// ─── Order markup ──────────────────────────────────────────────────────────────

/** Coloured centre-line width of an order arrow. `ORDER_LINE_WIDTH`. */
export const ORDER_LINE_WIDTH = 3;
/** Half-width of the arrowhead. `ORDER_ARROW_WIDTH`. */
export const ORDER_ARROW_WIDTH = 6;
/** Length of the arrowhead along the shaft. `ORDER_ARROW_LENGTH`. */
export const ORDER_ARROW_LENGTH = 8;
/** Black outline width drawn on both sides of the coloured line/arrowhead. */
export const ORDER_STROKE_WIDTH = 2.5;
/** Dash pattern for support orders. `ORDER_DASH`. */
export const ORDER_DASH = { length: 4, spacing: 2 } as const;
/** Stroke colour for a successful/undetermined order. `SUCCESS_COLOR`. */
export const ORDER_SUCCESS_COLOR = "rgba(0,0,0,1)";

/** Flat-to-flat size of the hold-order octagon. `HOLD_OCTAGON_SIZE`. */
export const HOLD_OCTAGON_SIZE = 24;

// ─── Adjustment / failure markers (mirrored for completeness; not previewed) ────

export const FAILED_CROSS_WIDTH = 3;
export const FAILED_CROSS_LENGTH = 16;
export const FAILED_CROSS_ANGLE = 45;
export const ORDER_MARKER_WIDTH = 3;
export const ORDER_MARKER_LENGTH = 12;
export const ORDER_MARKER_ANGLE = 90;
export const BUILD_CROSS_OFFSET_X = 8;
export const BUILD_CROSS_OFFSET_Y = -8;
export const DISBAND_MARKER_OFFSET_X = 10;
export const DISBAND_MARKER_OFFSET_Y = -6;

// ─── Scaling bounds (the `.dvar` `unitScaling` field range) ────────────────────

export const MIN_UNIT_SCALE = 0.1;
export const MAX_UNIT_SCALE = 10;
