const SVG_NS = "http://www.w3.org/2000/svg";

const GENERIC_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy",
  "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded",
]);

export interface FontCheckResult {
  family: string;
  variants: Set<string>;
  availableOnGoogle: boolean;
}

export interface SvgFontInfo {
  chars: string;
  fonts: FontCheckResult[];
}

// Map of family name → Set of "weight/italic-flag" strings e.g. "700/1"
type FontVariants = Map<string, Set<string>>;

function normalizeFontFamily(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "").trim();
}

function normalizeWeight(w: string): string {
  const map: Record<string, string> = { normal: "400", bold: "700", lighter: "300", bolder: "700" };
  return map[w.toLowerCase().trim()] ?? w.trim();
}

function isItalic(s: string): boolean {
  const l = s.trim().toLowerCase();
  return l === "italic" || l === "oblique";
}

function recordUsage(usages: FontVariants, families: string[], weight: string, italic: boolean) {
  const variantKey = `${normalizeWeight(weight)}/${italic ? "1" : "0"}`;
  for (const raw of families) {
    const family = normalizeFontFamily(raw);
    if (!family || GENERIC_FAMILIES.has(family.toLowerCase())) continue;
    if (!usages.has(family)) usages.set(family, new Set());
    usages.get(family)!.add(variantKey);
  }
}

function extractFontVariants(root: Element): FontVariants {
  const usages: FontVariants = new Map();

  for (const el of Array.from(root.querySelectorAll("*"))) {
    const directFamily = el.getAttribute("font-family");
    if (directFamily) {
      recordUsage(
        usages,
        directFamily.split(","),
        el.getAttribute("font-weight") ?? "400",
        isItalic(el.getAttribute("font-style") ?? ""),
      );
    }

    const styleAttr = el.getAttribute("style") ?? "";
    if (styleAttr.includes("font-family")) {
      const families = styleAttr.match(/font-family\s*:\s*([^;]+)/)?.[1]?.split(",") ?? [];
      if (families.length > 0) {
        recordUsage(
          usages,
          families,
          styleAttr.match(/font-weight\s*:\s*([^;]+)/)?.[1] ?? "400",
          isItalic(styleAttr.match(/font-style\s*:\s*([^;]+)/)?.[1] ?? ""),
        );
      }
    }
  }

  // Scan <style> blocks — extract per-rule font declarations
  for (const styleEl of Array.from(root.querySelectorAll("style"))) {
    const css = styleEl.textContent ?? "";
    for (const block of css.match(/\{[^}]+\}/g) ?? []) {
      const families = block.match(/font-family\s*:\s*([^;}"]+)/)?.[1]?.split(",") ?? [];
      if (families.length === 0) continue;
      recordUsage(
        usages,
        families,
        block.match(/font-weight\s*:\s*([^;}"]+)/)?.[1] ?? "400",
        isItalic(block.match(/font-style\s*:\s*([^;}"]+)/)?.[1] ?? ""),
      );
    }
  }

  return usages;
}

function extractUsedChars(root: Element): string {
  const chars = new Set<string>();
  for (const el of Array.from(root.querySelectorAll("text, tspan, textPath"))) {
    for (const char of el.textContent ?? "") {
      if (char.trim()) chars.add(char);
    }
  }
  return Array.from(chars).join("");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...Array.from(bytes.subarray(i, Math.min(i + CHUNK, bytes.length)))));
  }
  return btoa(parts.join(""));
}

async function fetchGoogleFontCss(family: string, variants: Set<string>, chars: string): Promise<string | null> {
  const encodedFamily = family.replace(/ /g, "+");
  const textParam = encodeURIComponent(chars);

  const hasItalic = Array.from(variants).some(v => v.endsWith("/1"));
  let variantStr: string;
  if (hasItalic) {
    const parts = Array.from(variants)
      .map(v => { const [weight, ital] = v.split("/"); return `${ital},${weight}`; })
      .sort();
    variantStr = `ital,wght@${parts.join(";")}`;
  } else {
    const weights = Array.from(variants).map(v => v.split("/")[0]).sort();
    variantStr = `wght@${weights.join(";")}`;
  }

  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodedFamily}:${variantStr}&text=${textParam}`;

  try {
    const resp = await fetch(cssUrl);
    if (!resp.ok) return null;
    const css = await resp.text();
    return css.includes("@font-face") ? css : null;
  } catch {
    return null;
  }
}

async function inlineFontUrls(css: string): Promise<string> {
  const processed: string[] = [];

  for (const match of [...css.matchAll(/@font-face\s*\{[^}]+\}/g)]) {
    const block = match[0];
    const urlMatch = block.match(/url\(['"]?([^'")\s]+)['"]?\)\s+format\(['"]?woff2['"]?\)/i);

    if (!urlMatch) { processed.push(block); continue; }

    try {
      const resp = await fetch(urlMatch[1]);
      if (!resp.ok) { processed.push(block); continue; }
      const base64 = arrayBufferToBase64(await resp.arrayBuffer());
      const dataUrl = `data:font/woff2;charset=utf-8;base64,${base64}`;
      processed.push(block.replace(urlMatch[0], `url('${dataUrl}') format('woff2')`));
    } catch {
      processed.push(block);
    }
  }

  return processed.join("\n");
}

// Phase 1: scan SVG and check Google Fonts availability for each font family found.
export async function analyzeSvgFonts(svgString: string): Promise<SvgFontInfo> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const root = doc.documentElement;

  const chars = extractUsedChars(root);
  const fontVariants = extractFontVariants(root);

  const fonts: FontCheckResult[] = await Promise.all(
    Array.from(fontVariants.entries()).map(async ([family, variants]) => {
      const css = chars ? await fetchGoogleFontCss(family, variants, chars) : null;
      return { family, variants, availableOnGoogle: css !== null };
    })
  );

  return { chars, fonts };
}

// Phase 2: fetch subset WOFF2s from Google Fonts and/or inline uploaded buffers,
// then inject @font-face rules into the SVG's <style> element.
// uploadedFonts: family name → full WOFF2 ArrayBuffer (for fonts not on Google Fonts).
export async function embedFonts(
  svgString: string,
  fontInfo: SvgFontInfo,
  uploadedFonts: Map<string, ArrayBuffer>,
): Promise<string> {
  const { chars, fonts } = fontInfo;
  if (!chars || fonts.length === 0) return svgString;

  const cssParts: string[] = [];

  for (const font of fonts) {
    if (font.availableOnGoogle) {
      const css = await fetchGoogleFontCss(font.family, font.variants, chars);
      if (!css) continue;
      const inlined = await inlineFontUrls(css);
      if (inlined) cssParts.push(inlined);
    } else {
      const buffer = uploadedFonts.get(font.family);
      if (!buffer) continue;
      const base64 = arrayBufferToBase64(buffer);
      const dataUrl = `data:font/woff2;charset=utf-8;base64,${base64}`;
      // font-weight: 100 900 covers all weights from the single uploaded file
      cssParts.push(
        `@font-face {\n  font-family: '${font.family}';\n  font-weight: 100 900;\n  font-style: normal;\n  src: url('${dataUrl}') format('woff2');\n}`,
      );
    }
  }

  if (cssParts.length === 0) return svgString;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const root = doc.documentElement;

  // querySelector("style") resolves to HTMLStyleElement via the HTML overload, which
  // is incompatible with the SVGStyleElement returned by createElementNS. Cast to the
  // common base type so both sources are assignable.
  const existingStyleEl = root.querySelector("style") as Element | null;
  let styleEl: Element;
  if (existingStyleEl) {
    styleEl = existingStyleEl;
  } else {
    styleEl = doc.createElementNS(SVG_NS, "style");
    root.insertBefore(styleEl, root.firstChild);
  }

  const existing = styleEl.textContent ?? "";
  styleEl.textContent = cssParts.join("\n") + (existing ? "\n" + existing : "");

  return new XMLSerializer().serializeToString(doc);
}
