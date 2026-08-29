/**
 * SVG order primitives — faithful port of the subset of diplicity-react's
 * renderer that the dVAR Creator's Unit Scaling preview needs.
 *
 * Source of truth:
 *   diplicity-react/packages/web/src/components/InteractiveMap/svgPrimitives.ts
 *   (`octagon`, `arrow`, and their private helpers)
 *
 * Copied verbatim (only reformatted) so the preview's hold octagons and order
 * arrows are geometrically identical to production output, differing only by the
 * `unitScaling` multiplier the caller applies to the size arguments. Keep in
 * sync with the upstream file. See [[unit-render-metrics]] for the size
 * constants these are called with.
 */

export type Point = { x: number; y: number };
export type Dash = { length: number; spacing: number };

/** Round to 2 decimal places — upstream `formatCoord`. */
export const formatCoord = (value: number): string =>
  String(Math.round(value * 100) / 100);

const n = formatCoord;

const strokeLine = (
  d: string,
  stroke: string,
  strokeWidth: number,
  dash?: Dash
): string =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${n(strokeWidth)}"` +
  ` stroke-dasharray="${dash ? `${dash.length} ${dash.spacing}` : "none"}"/>`;

const polygonPath = (
  points: Point[],
  fill: string,
  stroke: string,
  strokeWidth: number
): string => {
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${n(p.x)} ${n(p.y)}`)
    .join(" ");
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${n(strokeWidth)}"/>`;
};

export type OctagonOptions = {
  x: number;
  y: number;
  size: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  renderBottomCenter?: (x: number, y: number) => string;
};

export const octagon = (o: OctagonOptions): string => {
  const step = Math.PI / 4;
  const radius = o.size / (2 * Math.sin(step));
  const points = Array.from({ length: 8 }, (_, i) => {
    const theta = step * i + Math.PI / 8;
    return {
      x: o.x + radius * Math.cos(theta),
      y: o.y + radius * Math.sin(theta),
    };
  });
  const pointsAttr = points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
  const bottomCenterX = (points[1].x + points[2].x) / 2;
  const bottomCenterY = (points[1].y + points[2].y) / 2;
  const extra = o.renderBottomCenter
    ? o.renderBottomCenter(bottomCenterX, bottomCenterY)
    : "";
  const opacityAttr = o.opacity !== undefined ? ` opacity="${o.opacity}"` : "";
  return (
    `<g><polygon points="${pointsAttr}" fill="${o.fill}" stroke="${o.stroke}" stroke-width="${n(o.strokeWidth)}"${opacityAttr}/>` +
    `${extra}</g>`
  );
};

export type ArrowOptions = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lineWidth: number;
  arrowWidth: number;
  arrowLength: number;
  offset: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: Dash;
  controlPoint?: Point;
  renderCenter?: (x: number, y: number, angle: number) => string;
};

export const arrow = (o: ArrowOptions): string => {
  if (o.controlPoint) {
    const { x: cx, y: cy } = o.controlPoint;

    const startDx = cx - o.x1;
    const startDy = cy - o.y1;
    const startLen = Math.sqrt(startDx * startDx + startDy * startDy);
    const startX = o.x1 + (startDx / startLen) * o.offset;
    const startY = o.y1 + (startDy / startLen) * o.offset;

    const endDx = o.x2 - cx;
    const endDy = o.y2 - cy;
    const endLen = Math.sqrt(endDx * endDx + endDy * endDy);
    const etx = endDx / endLen;
    const ety = endDy / endLen;
    const endAngle = Math.atan2(ety, etx);

    const tipX = o.x2 - etx * o.offset;
    const tipY = o.y2 - ety * o.offset;
    const endX = tipX - etx * o.arrowLength;
    const endY = tipY - ety * o.arrowLength;

    const perpAngle = endAngle + Math.PI / 2;
    const perpCos = Math.cos(perpAngle);
    const perpSin = Math.sin(perpAngle);
    const arrowhead: Point[] = [
      { x: endX - (o.lineWidth / 2) * perpCos, y: endY - (o.lineWidth / 2) * perpSin },
      { x: endX - o.arrowWidth * perpCos, y: endY - o.arrowWidth * perpSin },
      { x: tipX, y: tipY },
      { x: endX + o.arrowWidth * perpCos, y: endY + o.arrowWidth * perpSin },
      { x: endX + (o.lineWidth / 2) * perpCos, y: endY + (o.lineWidth / 2) * perpSin },
    ];

    const centerX = 0.25 * o.x1 + 0.5 * cx + 0.25 * o.x2;
    const centerY = 0.25 * o.y1 + 0.5 * cy + 0.25 * o.y2;
    const centerAngle = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);

    const d = `M ${n(startX)} ${n(startY)} Q ${n(cx)} ${n(cy)} ${n(endX)} ${n(endY)}`;
    return (
      `<g>` +
      strokeLine(d, o.stroke, o.lineWidth + o.strokeWidth * 2, o.dash) +
      strokeLine(d, o.fill, o.lineWidth, o.dash) +
      polygonPath(arrowhead, o.fill, o.stroke, o.strokeWidth) +
      (o.renderCenter ? o.renderCenter(centerX, centerY, centerAngle) : "") +
      `</g>`
    );
  }

  const angle = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
  const offsetX = o.offset * Math.cos(angle);
  const offsetY = o.offset * Math.sin(angle);

  const startX = o.x1 + offsetX;
  const startY = o.y1 + offsetY;
  const endX = o.x2 - offsetX - o.arrowLength * Math.cos(angle);
  const endY = o.y2 - offsetY - o.arrowLength * Math.sin(angle);

  const centerX = (startX + endX) / 2;
  const centerY = (startY + endY) / 2;

  const perpAngle = angle + Math.PI / 2;
  const perpCos = Math.cos(perpAngle);
  const perpSin = Math.sin(perpAngle);
  const arrowhead: Point[] = [
    { x: endX - (o.lineWidth / 2) * perpCos, y: endY - (o.lineWidth / 2) * perpSin },
    { x: endX - o.arrowWidth * perpCos, y: endY - o.arrowWidth * perpSin },
    { x: endX + o.arrowLength * Math.cos(angle), y: endY + o.arrowLength * Math.sin(angle) },
    { x: endX + o.arrowWidth * perpCos, y: endY + o.arrowWidth * perpSin },
    { x: endX + (o.lineWidth / 2) * perpCos, y: endY + (o.lineWidth / 2) * perpSin },
  ];

  const d = `M ${n(startX)} ${n(startY)} L ${n(endX)} ${n(endY)}`;
  return (
    `<g>` +
    strokeLine(d, o.stroke, o.lineWidth + o.strokeWidth * 2, o.dash) +
    strokeLine(d, o.fill, o.lineWidth, o.dash) +
    polygonPath(arrowhead, o.fill, o.stroke, o.strokeWidth) +
    (o.renderCenter ? o.renderCenter(centerX, centerY, angle) : "") +
    `</g>`
  );
};
