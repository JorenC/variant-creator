import { describe, it, expect } from "vitest";
import { resolveTransforms, pathToAbsolute, scaleSubtree } from "@/utils/svgTransform";

function parseSvg(xml: string): Element {
  const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
  return doc.documentElement;
}

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? "";
}

// ─── Path transform resolution ────────────────────────────────────────────────

describe("resolveTransforms – path", () => {
  it("bakes layer translate into path coordinates", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(10 20)">
          <path id="p" d="M 0 0 L 100 50"/>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    const path = root.querySelector("#p")!;
    expect(attr(path, "d")).toBe("M 10 20 L 110 70");
    // group transform removed
    expect(root.querySelector("g")!.hasAttribute("transform")).toBe(false);
  });

  it("bakes nested group translates", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(5 0)">
          <g transform="translate(3 0)">
            <path id="p" d="M 0 0 L 10 0"/>
          </g>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    expect(attr(root.querySelector("#p")!, "d")).toBe("M 8 0 L 18 0");
  });

  it("resolves circle cx/cy from parent translate", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(50 100)">
          <circle id="c" cx="10" cy="20" r="5"/>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    const c = root.querySelector("#c")!;
    expect(attr(c, "cx")).toBe("60");
    expect(attr(c, "cy")).toBe("120");
    expect(attr(c, "r")).toBe("5");
  });
});

// ─── scaleSubtree ──────────────────────────────────────────────────────────────

describe("scaleSubtree", () => {
  it("is a no-op at scale 1", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <path id="p" d="M 0 0 L 10 10"/>
      </svg>
    `);
    scaleSubtree(root, 1);
    expect(attr(root.querySelector("#p")!, "d")).toBe("M 0 0 L 10 10");
  });

  it("scales path coordinates uniformly", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <path id="p" d="M 10 20 L 100 50"/>
      </svg>
    `);
    scaleSubtree(root, 0.5);
    expect(attr(root.querySelector("#p")!, "d")).toBe("M 5 10 L 50 25");
  });

  it("scales rect geometry (position and size)", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect id="r" x="10" y="20" width="40" height="60"/>
      </svg>
    `);
    scaleSubtree(root, 0.5);
    const r = root.querySelector("#r")!;
    expect(attr(r, "x")).toBe("5");
    expect(attr(r, "y")).toBe("10");
    expect(attr(r, "width")).toBe("20");
    expect(attr(r, "height")).toBe("30");
  });
});

// ─── Text rotation preservation ───────────────────────────────────────────────

describe("resolveTransforms – text rotation", () => {
  it("preserves rotate(α) on text as an equivalent matrix transform", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g>
          <text id="t" transform="rotate(-8)" x="-89" y="79">
            <tspan x="287" y="1059">Marseilles</tspan>
          </text>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    const text = root.querySelector("#t")!;
    // Rotation is preserved as a matrix (visually identical to rotate(-8))
    expect(text.getAttribute("transform")).toMatch(/^matrix\(/);
    // No ancestor translation → tspan coordinates unchanged
    const tspan = text.querySelector("tspan")!;
    expect(parseFloat(attr(tspan, "x"))).toBeCloseTo(287, 1);
    expect(parseFloat(attr(tspan, "y"))).toBeCloseTo(1059, 1);
  });

  it("composes ancestor translate into text matrix (rotate without center)", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(100 0)">
          <text id="t" transform="rotate(-90)" x="0" y="0">
            <tspan id="ts" x="200" y="300">Label</tspan>
          </text>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    const text = root.querySelector("#t")!;
    // Full composed matrix is written back; tspan x/y are untouched
    expect(text.getAttribute("transform")).toMatch(/^matrix\(/);
    const tspan = root.querySelector("#ts")!;
    expect(parseFloat(attr(tspan, "x"))).toBeCloseTo(200, 1);
    expect(parseFloat(attr(tspan, "y"))).toBeCloseTo(300, 1);
  });

  it("preserves rotate(α,cx,cy) on text as a matrix transform", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(10 20)">
          <text id="t" transform="rotate(-30,50,60)" x="50" y="60">
            <tspan id="ts" x="50" y="60">Label</tspan>
          </text>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    const text = root.querySelector("#t")!;
    // Previously stripped because isPureRotation returned false for center-point rotations
    expect(text.getAttribute("transform")).toMatch(/^matrix\(/);
    const tspan = root.querySelector("#ts")!;
    expect(parseFloat(attr(tspan, "x"))).toBeCloseTo(50, 1);
    expect(parseFloat(attr(tspan, "y"))).toBeCloseTo(60, 1);
  });

  it("removes transform when text has only translate (no rotation)", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text id="t" transform="translate(50 30)" x="10" y="20">
          <tspan id="ts" x="10" y="20">Label</tspan>
        </text>
      </svg>
    `);
    resolveTransforms(root);
    const text = root.querySelector("#t")!;
    expect(text.hasAttribute("transform")).toBe(false);
    expect(attr(text, "x")).toBe("60");
    expect(attr(text, "y")).toBe("50");
    const tspan = root.querySelector("#ts")!;
    expect(attr(tspan, "x")).toBe("60");
    expect(attr(tspan, "y")).toBe("50");
  });
});

describe("path data parsing – compact number syntax", () => {
  it("parses implicit minus separators and decimal repeats", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(10 10)">
          <path id="p" d="M10-20L.5.5"/>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    expect(attr(root.querySelector("#p")!, "d")).toBe("M 20 -10 L 10.5 10.5");
  });
});

describe("pathToAbsolute", () => {
  it("converts relative commands without moving the path", () => {
    expect(pathToAbsolute("m 5 5 l 10 0 z")).toBe("M 5 5 L 15 5 Z");
  });

  it("keeps absolute commands intact", () => {
    expect(pathToAbsolute("M 5 5 L 15 5 Z")).toBe("M 5 5 L 15 5 Z");
  });

  // Figma/SVGO routinely serialize a closepath immediately followed by the
  // next subpath's moveto with zero characters between them (e.g. "...Z M10
  // 10..." written as "...ZM10 10..."). A prior bug made the tokenizer treat
  // that following "M"/"m" as Z's (nonexistent) argument text and discard it
  // along with its coordinates, silently deleting an entire disconnected
  // subpath's moveto and turning multi-island provinces into one shape
  // connected by stray straight lines across the map.
  it("preserves a moveto that immediately abuts the previous closepath", () => {
    expect(pathToAbsolute("M0 0L10 0L10 10ZM50 50L60 50L60 60Z")).toBe(
      "M 0 0 L 10 0 L 10 10 Z M 50 50 L 60 50 L 60 60 Z"
    );
  });

  it("preserves a relative moveto that immediately abuts the previous closepath", () => {
    expect(pathToAbsolute("M0 0L10 0L10 10Zm50 50l10 0l0 10z")).toBe(
      "M 0 0 L 10 0 L 10 10 Z M 50 50 L 60 50 L 60 60 Z"
    );
  });

  it("preserves many back-to-back Z+moveto subpaths (archipelago provinces)", () => {
    const d = "M0 0L1 0L1 1ZM10 10L11 10L11 11ZM20 20L21 20L21 21Zm30 0l1 0l0 1z";
    const abs = pathToAbsolute(d);
    expect((abs.match(/[M]/g) ?? []).length).toBe(4);
    expect(abs).toBe(
      "M 0 0 L 1 0 L 1 1 Z M 10 10 L 11 10 L 11 11 Z M 20 20 L 21 20 L 21 21 Z M 50 20 L 51 20 L 51 21 Z"
    );
  });
});

describe("resolveTransforms – rotated shapes become paths", () => {
  it("converts a rotated rect to an equivalent path", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(90)">
          <rect id="r" x="0" y="0" width="10" height="20" fill="red"/>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    expect(root.querySelector("rect")).toBeNull();
    const path = root.querySelector("path")!;
    expect(attr(path, "id")).toBe("r");
    expect(attr(path, "fill")).toBe("red");
    // rotate(90): (x, y) → (−y, x); corners (0,0) (10,0) (10,20) (0,20)
    expect(attr(path, "d")).toBe("M 0 0 L 0 10 L -20 10 L -20 0 Z");
  });

  it("keeps axis-aligned rects as rects under translate and scale", () => {
    const root = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(5 5) scale(2)">
          <rect id="r" x="0" y="0" width="10" height="20"/>
        </g>
      </svg>
    `);
    resolveTransforms(root);
    const rect = root.querySelector("rect")!;
    expect(attr(rect, "x")).toBe("5");
    expect(attr(rect, "width")).toBe("20");
  });
});
