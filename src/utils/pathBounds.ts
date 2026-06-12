/**
 * Exact bounding-box computation for SVG path data. Pure math — no DOM, no
 * Paper.js — so it runs in any environment and is unit-testable.
 *
 * Handles every path command, including relative forms and arcs: unit-position
 * markers drawn in Inkscape serialize circles as `M … A … A … Z`, and sampling
 * only command endpoints would collapse such a path to a point on its rim.
 */

import { tokenizePathData } from "@/utils/svgTransform";

export interface PathBoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

class BoundsAccumulator {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  add(x: number, y: number): void {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }

  toRect(): PathBoundsRect | null {
    if (!isFinite(this.minX)) return null;
    return {
      x: this.minX,
      y: this.minY,
      width: this.maxX - this.minX,
      height: this.maxY - this.minY,
    };
  }
}

// Roots of the derivative of a 1D cubic bezier, restricted to (0, 1).
function cubicExtremeTs(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 6 * (p0 - 2 * p1 + p2);
  const c = 3 * (p1 - p0);
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter(t => t > 0 && t < 1);
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function addCubic(
  acc: BoundsAccumulator,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
): void {
  acc.add(x3, y3);
  for (const t of cubicExtremeTs(x0, x1, x2, x3)) acc.add(cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t));
  for (const t of cubicExtremeTs(y0, y1, y2, y3)) acc.add(cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t));
}

function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

function addQuad(
  acc: BoundsAccumulator,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
): void {
  acc.add(x2, y2);
  // The derivative of a quadratic bezier is linear; one candidate t per axis.
  const denX = x0 - 2 * x1 + x2;
  if (Math.abs(denX) > 1e-12) {
    const t = (x0 - x1) / denX;
    if (t > 0 && t < 1) acc.add(quadAt(x0, x1, x2, t), quadAt(y0, y1, y2, t));
  }
  const denY = y0 - 2 * y1 + y2;
  if (Math.abs(denY) > 1e-12) {
    const t = (y0 - y1) / denY;
    if (t > 0 && t < 1) acc.add(quadAt(x0, x1, x2, t), quadAt(y0, y1, y2, t));
  }
}

const TWO_PI = Math.PI * 2;

// True when angle θ lies on the arc swept from θ1 by Δθ (sign = direction).
function angleOnArc(theta: number, theta1: number, deltaTheta: number): boolean {
  const norm = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
  const rel = norm(theta - theta1);
  return deltaTheta >= 0 ? rel <= deltaTheta : rel >= TWO_PI + deltaTheta;
}

// Endpoint-to-center arc conversion per the SVG spec (appendix B.2.4), then
// extreme-angle candidates of the rotated ellipse.
function addArc(
  acc: BoundsAccumulator,
  x1: number, y1: number,
  rxIn: number, ryIn: number,
  phiDeg: number, largeArc: number, sweep: number,
  x2: number, y2: number,
): void {
  acc.add(x2, y2);
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-12 || ry < 1e-12) return;
  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArc !== sweep ? 1 : -1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  if (den < 1e-12) return;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let deltaTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && deltaTheta > 0) deltaTheta -= TWO_PI;
  if (sweep && deltaTheta < 0) deltaTheta += TWO_PI;

  const pointAt = (theta: number): [number, number] => [
    cx + rx * Math.cos(theta) * cosPhi - ry * Math.sin(theta) * sinPhi,
    cy + rx * Math.cos(theta) * sinPhi + ry * Math.sin(theta) * cosPhi,
  ];

  const thetaX = Math.atan2(-ry * sinPhi, rx * cosPhi);
  const thetaY = Math.atan2(ry * cosPhi, rx * sinPhi);
  for (const candidate of [thetaX, thetaX + Math.PI, thetaY, thetaY + Math.PI]) {
    if (angleOnArc(candidate, theta1, deltaTheta)) {
      const [px, py] = pointAt(candidate);
      acc.add(px, py);
    }
  }
}

/** Exact bounding box of SVG path data, or null when no drawable point exists. */
export function calculatePathDataBounds(d: string): PathBoundsRect | null {
  const acc = new BoundsAccumulator();
  let cx = 0, cy = 0;       // current point
  let sx = 0, sy = 0;       // subpath start
  let prevCubicCx: number | null = null, prevCubicCy: number | null = null;
  let prevQuadCx: number | null = null, prevQuadCy: number | null = null;

  for (const { cmd, args } of tokenizePathData(d)) {
    const upper = cmd.toUpperCase();
    const abs = cmd === upper;
    let nextCubicC: [number, number] | null = null;
    let nextQuadC: [number, number] | null = null;

    switch (upper) {
      case "M": {
        const [x, y] = abs ? [args[0], args[1]] : [cx + args[0], cy + args[1]];
        acc.add(x, y);
        cx = x; cy = y; sx = x; sy = y;
        break;
      }
      case "L":
      case "T": {
        const [x, y] = abs ? [args[0], args[1]] : [cx + args[0], cy + args[1]];
        if (upper === "T") {
          const c1x = prevQuadCx !== null ? 2 * cx - prevQuadCx : cx;
          const c1y = prevQuadCy !== null ? 2 * cy - prevQuadCy : cy;
          addQuad(acc, cx, cy, c1x, c1y, x, y);
          nextQuadC = [c1x, c1y];
        } else {
          acc.add(x, y);
        }
        cx = x; cy = y;
        break;
      }
      case "H": {
        const x = abs ? args[0] : cx + args[0];
        acc.add(x, cy);
        cx = x;
        break;
      }
      case "V": {
        const y = abs ? args[0] : cy + args[0];
        acc.add(cx, y);
        cy = y;
        break;
      }
      case "C": {
        const [x1, y1, x2, y2, x, y] = abs
          ? args
          : [cx + args[0], cy + args[1], cx + args[2], cy + args[3], cx + args[4], cy + args[5]];
        addCubic(acc, cx, cy, x1, y1, x2, y2, x, y);
        nextCubicC = [x2, y2];
        cx = x; cy = y;
        break;
      }
      case "S": {
        const [x2, y2, x, y] = abs
          ? args
          : [cx + args[0], cy + args[1], cx + args[2], cy + args[3]];
        const x1 = prevCubicCx !== null ? 2 * cx - prevCubicCx : cx;
        const y1 = prevCubicCy !== null ? 2 * cy - prevCubicCy : cy;
        addCubic(acc, cx, cy, x1, y1, x2, y2, x, y);
        nextCubicC = [x2, y2];
        cx = x; cy = y;
        break;
      }
      case "Q": {
        const [x1, y1, x, y] = abs
          ? args
          : [cx + args[0], cy + args[1], cx + args[2], cy + args[3]];
        addQuad(acc, cx, cy, x1, y1, x, y);
        nextQuadC = [x1, y1];
        cx = x; cy = y;
        break;
      }
      case "A": {
        const [ex, ey] = abs ? [args[5], args[6]] : [cx + args[5], cy + args[6]];
        addArc(acc, cx, cy, args[0], args[1], args[2], args[3], args[4], ex, ey);
        cx = ex; cy = ey;
        break;
      }
      case "Z":
        cx = sx; cy = sy;
        break;
    }

    prevCubicCx = nextCubicC?.[0] ?? null;
    prevCubicCy = nextCubicC?.[1] ?? null;
    prevQuadCx = nextQuadC?.[0] ?? null;
    prevQuadCy = nextQuadC?.[1] ?? null;
  }

  return acc.toRect();
}
