// [a, b, c, d, e, f] per SVG matrix(a,b,c,d,e,f)
// | a  c  e |
// | b  d  f |
// | 0  0  1 |
type Matrix = [number, number, number, number, number, number];

function identity(): Matrix {
  return [1, 0, 0, 1, 0, 0];
}

function isIdentity(m: Matrix): boolean {
  return (
    Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 &&
    Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 &&
    Math.abs(m[4]) < 1e-9 && Math.abs(m[5]) < 1e-9
  );
}

function isTranslateOnly(m: Matrix): boolean {
  return (
    Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 &&
    Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9
  );
}

// compose: apply A then B  →  C = A × B
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyPt(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function fmt(n: number): string {
  const s = parseFloat(n.toFixed(3)).toString();
  return s === "-0" ? "0" : s;
}

function parseTransformAttr(attr: string): Matrix {
  let result = identity();
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attr)) !== null) {
    const fn = m[1].toLowerCase();
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix;
    switch (fn) {
      case "translate":
        t = [1, 0, 0, 1, nums[0] ?? 0, nums[1] ?? 0];
        break;
      case "scale": {
        const sx = nums[0] ?? 1;
        t = [sx, 0, 0, nums[1] ?? sx, 0, 0];
        break;
      }
      case "rotate": {
        const ang = ((nums[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        if (nums.length >= 3) {
          const [, cx, cy] = nums;
          t = [cos, sin, -sin, cos,
            cx - cos * cx + sin * cy,
            cy - sin * cx - cos * cy];
        } else {
          t = [cos, sin, -sin, cos, 0, 0];
        }
        break;
      }
      case "skewx": {
        const tan = Math.tan(((nums[0] ?? 0) * Math.PI) / 180);
        t = [1, 0, tan, 1, 0, 0];
        break;
      }
      case "skewy": {
        const tan = Math.tan(((nums[0] ?? 0) * Math.PI) / 180);
        t = [1, tan, 0, 1, 0, 0];
        break;
      }
      case "matrix":
        t = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
        break;
      default:
        continue;
    }
    result = multiply(result, t);
  }
  return result;
}

// ─── Path data transformer ────────────────────────────────────────────────────

interface PathCmd { cmd: string; args: number[] }

function parseArcArgs(raw: string): number[] {
  const nums: number[] = [];
  let i = 0;
  const s = raw.trim();

  const skipSep = () => { while (i < s.length && /[\s,]/.test(s[i])) i++; };
  const readNum = (): number | null => {
    skipSep();
    if (i >= s.length) return null;
    const start = i;
    if (s[i] === "+" || s[i] === "-") i++;
    while (i < s.length && /[\d.]/.test(s[i])) i++;
    if (i < s.length && (s[i] === "e" || s[i] === "E")) {
      i++;
      if (i < s.length && (s[i] === "+" || s[i] === "-")) i++;
      while (i < s.length && /\d/.test(s[i])) i++;
    }
    return i === start ? null : parseFloat(s.slice(start, i));
  };
  const readFlag = (): number | null => {
    skipSep();
    if (i >= s.length) return null;
    return parseInt(s[i++]);
  };

  while (i < s.length) {
    skipSep();
    if (i >= s.length) break;
    const rx = readNum(); if (rx === null) break;
    const ry = readNum(); if (ry === null) break;
    const xr = readNum(); if (xr === null) break;
    const laf = readFlag(); if (laf === null) break;
    const sf = readFlag(); if (sf === null) break;
    const x = readNum(); if (x === null) break;
    const y = readNum(); if (y === null) break;
    nums.push(rx, ry, xr, laf, sf, x, y);
  }
  return nums;
}

function tokenizePathData(d: string): PathCmd[] {
  const result: PathCmd[] = [];
  const parts = d.split(/([MmZzLlHhVvCcSsQqTtAa])/).filter(s => s !== "");

  for (let i = 0; i < parts.length; i++) {
    const cmd = parts[i];
    if (!/^[MmZzLlHhVvCcSsQqTtAa]$/.test(cmd)) continue;
    const rawArgs = (parts[i + 1] ?? "").trim();
    i++;

    if (cmd === "Z" || cmd === "z") {
      result.push({ cmd, args: [] });
      continue;
    }

    const upper = cmd.toUpperCase();
    let n: number;
    if (upper === "H" || upper === "V") n = 1;
    else if (upper === "M" || upper === "L" || upper === "T") n = 2;
    else if (upper === "S" || upper === "Q") n = 4;
    else if (upper === "C") n = 6;
    else if (upper === "A") n = 7;
    else continue;

    const nums = upper === "A"
      ? parseArcArgs(rawArgs)
      : rawArgs.split(/[\s,]+/).filter(Boolean).map(Number);

    let isFirst = true;
    for (let j = 0; j + n <= nums.length; j += n) {
      let c = cmd;
      if (!isFirst && upper === "M") c = cmd === "M" ? "L" : "l";
      result.push({ cmd: c, args: nums.slice(j, j + n) });
      isFirst = false;
    }
  }
  return result;
}

function transformPathData(d: string, m: Matrix): string {
  if (isIdentity(m)) return d;
  const tokens = tokenizePathData(d);
  const out: string[] = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const tOnly = isTranslateOnly(m);

  for (const { cmd, args } of tokens) {
    const upper = cmd.toUpperCase();
    const abs = cmd === upper;

    switch (upper) {
      case "M": {
        const [x, y] = abs ? [args[0], args[1]] : [cx + args[0], cy + args[1]];
        const [nx, ny] = applyPt(m, x, y);
        out.push(`M ${fmt(nx)} ${fmt(ny)}`);
        cx = x; cy = y; sx = x; sy = y;
        break;
      }
      case "L": {
        const [x, y] = abs ? [args[0], args[1]] : [cx + args[0], cy + args[1]];
        const [nx, ny] = applyPt(m, x, y);
        out.push(`L ${fmt(nx)} ${fmt(ny)}`);
        cx = x; cy = y;
        break;
      }
      case "H": {
        const x = abs ? args[0] : cx + args[0];
        if (tOnly) {
          const [nx] = applyPt(m, x, cy);
          out.push(`H ${fmt(nx)}`);
        } else {
          const [nx, ny] = applyPt(m, x, cy);
          out.push(`L ${fmt(nx)} ${fmt(ny)}`);
        }
        cx = x;
        break;
      }
      case "V": {
        const y = abs ? args[0] : cy + args[0];
        if (tOnly) {
          const [, ny] = applyPt(m, cx, y);
          out.push(`V ${fmt(ny)}`);
        } else {
          const [nx, ny] = applyPt(m, cx, y);
          out.push(`L ${fmt(nx)} ${fmt(ny)}`);
        }
        cy = y;
        break;
      }
      case "C": {
        const [x1, y1, x2, y2, x, y] = abs
          ? args
          : [cx+args[0], cy+args[1], cx+args[2], cy+args[3], cx+args[4], cy+args[5]];
        const [nx1, ny1] = applyPt(m, x1, y1);
        const [nx2, ny2] = applyPt(m, x2, y2);
        const [nx, ny] = applyPt(m, x, y);
        out.push(`C ${fmt(nx1)} ${fmt(ny1)} ${fmt(nx2)} ${fmt(ny2)} ${fmt(nx)} ${fmt(ny)}`);
        cx = x; cy = y;
        break;
      }
      case "S": {
        const [x2, y2, x, y] = abs
          ? args
          : [cx+args[0], cy+args[1], cx+args[2], cy+args[3]];
        const [nx2, ny2] = applyPt(m, x2, y2);
        const [nx, ny] = applyPt(m, x, y);
        out.push(`S ${fmt(nx2)} ${fmt(ny2)} ${fmt(nx)} ${fmt(ny)}`);
        cx = x; cy = y;
        break;
      }
      case "Q": {
        const [x1, y1, x, y] = abs
          ? args
          : [cx+args[0], cy+args[1], cx+args[2], cy+args[3]];
        const [nx1, ny1] = applyPt(m, x1, y1);
        const [nx, ny] = applyPt(m, x, y);
        out.push(`Q ${fmt(nx1)} ${fmt(ny1)} ${fmt(nx)} ${fmt(ny)}`);
        cx = x; cy = y;
        break;
      }
      case "T": {
        const [x, y] = abs ? args : [cx + args[0], cy + args[1]];
        const [nx, ny] = applyPt(m, x, y);
        out.push(`T ${fmt(nx)} ${fmt(ny)}`);
        cx = x; cy = y;
        break;
      }
      case "A": {
        const [ex, ey] = abs ? [args[5], args[6]] : [cx + args[5], cy + args[6]];
        const [nex, ney] = applyPt(m, ex, ey);
        let rx = args[0], ry = args[1];
        let xrot = args[2];
        const laf = args[3], sf = args[4];
        if (!tOnly) {
          rx *= Math.sqrt(m[0] * m[0] + m[1] * m[1]);
          ry *= Math.sqrt(m[2] * m[2] + m[3] * m[3]);
          xrot += Math.atan2(m[1], m[0]) * (180 / Math.PI);
        }
        out.push(`A ${fmt(rx)} ${fmt(ry)} ${fmt(xrot)} ${laf} ${sf} ${fmt(nex)} ${fmt(ney)}`);
        cx = ex; cy = ey;
        break;
      }
      case "Z":
        out.push("Z");
        cx = sx; cy = sy;
        break;
    }
  }
  return out.join(" ");
}

// ─── Per-element coordinate transformation ────────────────────────────────────

function applyXY(el: Element, m: Matrix): void {
  if (isIdentity(m)) return;
  const x = el.getAttribute("x");
  const y = el.getAttribute("y");
  if (x !== null || y !== null) {
    const xv = x !== null ? parseFloat(x) || 0 : 0;
    const yv = y !== null ? parseFloat(y) || 0 : 0;
    const [nx, ny] = applyPt(m, xv, yv);
    if (x !== null) el.setAttribute("x", fmt(nx));
    if (y !== null) el.setAttribute("y", fmt(ny));
  }
}

function applyToElement(el: Element, m: Matrix): void {
  if (isIdentity(m)) return;
  const tag = el.tagName.replace(/^.*:/, "").toLowerCase();

  switch (tag) {
    case "path": {
      const d = el.getAttribute("d");
      if (d) el.setAttribute("d", transformPathData(d, m));
      break;
    }
    case "rect": {
      const x = parseFloat(el.getAttribute("x") ?? "0");
      const y = parseFloat(el.getAttribute("y") ?? "0");
      const [nx, ny] = applyPt(m, x, y);
      el.setAttribute("x", fmt(nx));
      el.setAttribute("y", fmt(ny));
      if (!isTranslateOnly(m)) {
        const w = parseFloat(el.getAttribute("width") ?? "0");
        const h = parseFloat(el.getAttribute("height") ?? "0");
        el.setAttribute("width", fmt(w * Math.sqrt(m[0] * m[0] + m[1] * m[1])));
        el.setAttribute("height", fmt(h * Math.sqrt(m[2] * m[2] + m[3] * m[3])));
      }
      break;
    }
    case "circle": {
      const [ncx, ncy] = applyPt(m,
        parseFloat(el.getAttribute("cx") ?? "0"),
        parseFloat(el.getAttribute("cy") ?? "0"),
      );
      el.setAttribute("cx", fmt(ncx));
      el.setAttribute("cy", fmt(ncy));
      if (!isTranslateOnly(m)) {
        const r = parseFloat(el.getAttribute("r") ?? "0");
        el.setAttribute("r", fmt(r * Math.sqrt(m[0] * m[0] + m[1] * m[1])));
      }
      break;
    }
    case "ellipse": {
      const [ncx, ncy] = applyPt(m,
        parseFloat(el.getAttribute("cx") ?? "0"),
        parseFloat(el.getAttribute("cy") ?? "0"),
      );
      el.setAttribute("cx", fmt(ncx));
      el.setAttribute("cy", fmt(ncy));
      if (!isTranslateOnly(m)) {
        el.setAttribute("rx", fmt(parseFloat(el.getAttribute("rx") ?? "0") * Math.sqrt(m[0] * m[0] + m[1] * m[1])));
        el.setAttribute("ry", fmt(parseFloat(el.getAttribute("ry") ?? "0") * Math.sqrt(m[2] * m[2] + m[3] * m[3])));
      }
      break;
    }
    case "line": {
      const [nx1, ny1] = applyPt(m, parseFloat(el.getAttribute("x1") ?? "0"), parseFloat(el.getAttribute("y1") ?? "0"));
      const [nx2, ny2] = applyPt(m, parseFloat(el.getAttribute("x2") ?? "0"), parseFloat(el.getAttribute("y2") ?? "0"));
      el.setAttribute("x1", fmt(nx1)); el.setAttribute("y1", fmt(ny1));
      el.setAttribute("x2", fmt(nx2)); el.setAttribute("y2", fmt(ny2));
      break;
    }
    case "polyline":
    case "polygon": {
      const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
      const out: string[] = [];
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const [nx, ny] = applyPt(m, pts[i], pts[i + 1]);
        out.push(`${fmt(nx)},${fmt(ny)}`);
      }
      el.setAttribute("points", out.join(" "));
      break;
    }
    case "use":
    case "image": {
      const [nx, ny] = applyPt(m,
        parseFloat(el.getAttribute("x") ?? "0"),
        parseFloat(el.getAttribute("y") ?? "0"),
      );
      el.setAttribute("x", fmt(nx));
      el.setAttribute("y", fmt(ny));
      break;
    }
  }
}

// ─── Text element special handling ───────────────────────────────────────────
//
// Text rotation (transform="rotate(α)") is intentional typography — it tilts
// province labels on the map and must be preserved.  Only ancestor translations
// (Inkscape layer offsets) need to be baked into the tspan coordinates.
//
// For a text with pure rotation R and ancestor translate A:
//   The ancestor's effect in the rotated local space is  M = R⁻¹ × A × R
//   We apply M to text x/y and all tspan x/y, then leave transform="rotate" as-is.

function applyTspans(text: Element, m: Matrix): void {
  applyXY(text, m);
  for (const child of Array.from(text.children)) {
    const tag = child.tagName.replace(/^.*:/, "").toLowerCase();
    if (tag !== "tspan") continue;
    applyXY(child, m);
    // nested tspan (rare but valid)
    for (const gc of Array.from(child.children)) {
      if (gc.tagName.replace(/^.*:/, "").toLowerCase() === "tspan") {
        applyXY(gc, m);
      }
    }
  }
}

function resolveTextElement(text: Element, ancestorMatrix: Matrix): void {
  const transformAttr = text.getAttribute("transform");
  const ownMatrix = transformAttr ? parseTransformAttr(transformAttr) : identity();
  const total = isIdentity(ownMatrix) ? ancestorMatrix : multiply(ancestorMatrix, ownMatrix);

  if (isIdentity(total)) {
    text.removeAttribute("transform");
  } else if (isTranslateOnly(total)) {
    // Pure translation — bake into x/y and drop the transform attribute
    applyTspans(text, total);
    text.removeAttribute("transform");
  } else {
    // Has rotation or scale — write the composed matrix back as the transform.
    // This covers rotate(α), rotate(α,cx,cy), and matrix(…) transforms; all
    // render identically to the original SVG.
    const [a, b, c, d, e, f] = total;
    text.setAttribute("transform", `matrix(${fmt(a)},${fmt(b)},${fmt(c)},${fmt(d)},${fmt(e)},${fmt(f)})`);
  }
  // Never recurse into tspan via the standard path — handled above
}

// ─── Recursive transform resolution ──────────────────────────────────────────

function resolveElement(el: Element, ancestorMatrix: Matrix): void {
  const tag = el.tagName.replace(/^.*:/, "").toLowerCase();

  if (tag === "text") {
    resolveTextElement(el, ancestorMatrix);
    return;
  }

  const attr = el.getAttribute("transform");
  const own = attr ? parseTransformAttr(attr) : identity();
  const total = isIdentity(own) ? ancestorMatrix : multiply(ancestorMatrix, own);

  applyToElement(el, total);
  el.removeAttribute("transform");

  for (const child of Array.from(el.children)) {
    resolveElement(child, total);
  }
}

/**
 * Bake all transform attributes in the subtree into coordinate attributes.
 * Text rotation (transform="rotate") is preserved — it is intentional typography.
 * All other transforms (layer translates, group offsets, scales) are resolved.
 */
export function resolveTransforms(root: Element): void {
  const attr = root.getAttribute("transform");
  if (attr) {
    const m = parseTransformAttr(attr);
    root.removeAttribute("transform");
    for (const child of Array.from(root.children)) {
      resolveElement(child, m);
    }
  } else {
    for (const child of Array.from(root.children)) {
      resolveElement(child, identity());
    }
  }
}
