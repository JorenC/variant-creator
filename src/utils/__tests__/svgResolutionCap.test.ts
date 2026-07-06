import { describe, it, expect } from "vitest";
import { capDsvgResolution, MAX_DSVG_PIXELS } from "@/utils/svgResolutionCap";

function parseSvg(xml: string) {
  return new DOMParser().parseFromString(xml, "image/svg+xml");
}

describe("capDsvgResolution", () => {
  it("is a no-op when the viewBox area is within budget", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path id="p" d="M 0 0 L 10 10"/></svg>`;
    const result = capDsvgResolution(svg);
    expect(result.capped).toBe(false);
    expect(result.output).toBe(svg);
    expect(result.originalWidth).toBe(1000);
    expect(result.originalHeight).toBe(1000);
  });

  it("is a no-op when viewBox is missing", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path id="p" d="M 0 0 L 10 10"/></svg>`;
    const result = capDsvgResolution(svg);
    expect(result.capped).toBe(false);
    expect(result.output).toBe(svg);
  });

  it("is a no-op when viewBox is malformed", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 abc 1000"><path id="p" d="M 0 0 L 10 10"/></svg>`;
    const result = capDsvgResolution(svg);
    expect(result.capped).toBe(false);
  });

  it("halves a 4000x4000 (16MP) viewBox down to the 4MP budget", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4000 4000">
      <g id="provinces" style="display:none"><path id="edi" d="M 0 0 L 4000 4000"/></g>
      <g id="unit-positions" style="display:none"><circle id="edi" cx="100" cy="200" r="10"/></g>
    </svg>`;
    const result = capDsvgResolution(svg);
    expect(result.capped).toBe(true);
    expect(result.originalWidth).toBe(4000);
    expect(result.originalHeight).toBe(4000);
    expect(result.scaledWidth).toBe(2000);
    expect(result.scaledHeight).toBe(2000);

    const doc = parseSvg(result.output);
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 2000 2000");
    expect(doc.getElementById("edi")).toBeTruthy();
    const path = doc.querySelector("#provinces path")!;
    expect(path.getAttribute("d")).toBe("M 0 0 L 2000 2000");
    const circle = doc.querySelector("#unit-positions circle")!;
    expect(circle.getAttribute("cx")).toBe("50");
    expect(circle.getAttribute("cy")).toBe("100");
    expect(circle.getAttribute("r")).toBe("5");

    const scaledArea = result.scaledWidth * result.scaledHeight;
    expect(scaledArea).toBeCloseTo(MAX_DSVG_PIXELS, 0);
  });

  it("scales a non-zero viewBox origin consistently with content", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1000 2000 4000 4000">
      <path id="p" d="M 1000 2000 L 5000 6000"/>
    </svg>`;
    const result = capDsvgResolution(svg);
    const doc = parseSvg(result.output);
    expect(doc.documentElement.getAttribute("viewBox")).toBe("500 1000 2000 2000");
    // The path's start point coincides with the viewBox origin, so it must
    // scale to the same new origin for the shape to stay anchored in place.
    expect(doc.getElementById("p")!.getAttribute("d")).toBe("M 500 1000 L 2500 3000");
  });

  it("preserves arc radii scaling while leaving rotation and flags untouched", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4000 4000">
      <path id="p" d="M 100 100 A 50 50 30 1 0 200 200"/>
    </svg>`;
    const result = capDsvgResolution(svg);
    const doc = parseSvg(result.output);
    const d = doc.getElementById("p")!.getAttribute("d")!;
    expect(d).toBe("M 50 50 A 25 25 30 1 0 100 100");
  });
});
