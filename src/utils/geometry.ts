import paper from "paper";
import type { Position } from "@/types/geometry";

paper.setup(new paper.Size(1, 1));

// paper.Path silently drops all but one subpath of multi-subpath data
// ("M…Z M…Z" island provinces); CompoundPath handles both single and
// multi-subpath path data correctly.
function createPathItem(pathD: string): paper.PathItem {
  return new paper.CompoundPath(pathD);
}

export function calculateCentroid(pathD: string): Position {
  const item = createPathItem(pathD);
  const center = item.bounds.center;
  item.remove();
  return { x: center.x, y: center.y };
}

export interface PathBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculatePositions(centroid: Position): {
  unitPosition: Position;
  dislodgedUnitPosition: Position;
  supplyCenterPosition: Position;
} {
  return {
    unitPosition: { x: centroid.x, y: centroid.y },
    dislodgedUnitPosition: { x: centroid.x + 15, y: centroid.y + 15 },
    supplyCenterPosition: { x: centroid.x - 12, y: centroid.y - 12 },
  };
}

export function detectPathIntersections(pathA: string, pathB: string): boolean {
  const paperPathA = createPathItem(pathA);
  const paperPathB = createPathItem(pathB);
  const intersections = paperPathA.getIntersections(paperPathB);
  paperPathA.remove();
  paperPathB.remove();
  return intersections.length >= 2;
}

// ─── Pre-parsed shapes for pairwise intersection sweeps ────────────────────────
//
// Pairwise adjacency detection over n provinces tests n²/2 pairs; parsing every
// path from its `d` string per pair freezes the UI for large maps. A
// PreparedShape parses each path once and carries a merged bounding box so
// non-overlapping pairs can be rejected without touching path geometry.

export interface PreparedShape {
  items: paper.PathItem[];
  bounds: PathBounds | null;
}

export function prepareShape(paths: string[]): PreparedShape {
  const items: paper.PathItem[] = [];
  for (const d of paths) {
    try {
      items.push(createPathItem(d));
    } catch {
      // skip unparseable paths
    }
  }
  let bounds: PathBounds | null = null;
  for (const item of items) {
    const b = item.bounds;
    if (!isFinite(b.x) || !isFinite(b.y)) continue;
    if (bounds === null) {
      bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    } else {
      const right = Math.max(bounds.x + bounds.width, b.x + b.width);
      const bottom = Math.max(bounds.y + bounds.height, b.y + b.height);
      bounds.x = Math.min(bounds.x, b.x);
      bounds.y = Math.min(bounds.y, b.y);
      bounds.width = right - bounds.x;
      bounds.height = bottom - bounds.y;
    }
  }
  return { items, bounds };
}

const BOUNDS_PADDING = 0.5;

function boundsOverlap(a: PathBounds, b: PathBounds): boolean {
  return (
    a.x <= b.x + b.width + BOUNDS_PADDING &&
    b.x <= a.x + a.width + BOUNDS_PADDING &&
    a.y <= b.y + b.height + BOUNDS_PADDING &&
    b.y <= a.y + a.height + BOUNDS_PADDING
  );
}

/** Same ≥2-crossings criterion as {@link detectPathIntersections}, bbox-prefiltered. */
export function preparedShapesIntersect(a: PreparedShape, b: PreparedShape): boolean {
  if (!a.bounds || !b.bounds) return false;
  if (!boundsOverlap(a.bounds, b.bounds)) return false;
  for (const ia of a.items) {
    for (const ib of b.items) {
      if (ia.getIntersections(ib).length >= 2) return true;
    }
  }
  return false;
}

export function disposeShape(shape: PreparedShape): void {
  for (const item of shape.items) item.remove();
}
