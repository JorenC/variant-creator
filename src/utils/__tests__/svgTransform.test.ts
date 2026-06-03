import { describe, it, expect } from "vitest";
import { resolveTransforms } from "@/utils/svgTransform";

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
