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
  it("preserves rotate transform on text", () => {
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
    // Rotation is kept
    expect(text.getAttribute("transform")).toBe("rotate(-8)");
    // No ancestor translation → coordinates unchanged
    const tspan = text.querySelector("tspan")!;
    expect(parseFloat(attr(tspan, "x"))).toBeCloseTo(287, 1);
    expect(parseFloat(attr(tspan, "y"))).toBeCloseTo(1059, 1);
  });

  it("bakes ancestor translate into tspan using rotated delta", () => {
    // Layer translate (100, 0) with text rotate(-90°).
    // rotate(-90°) local frame: x-axis points down, y-axis points left.
    // R⁻¹ * translate(100,0) * R applied to (sx, sy):
    //   R = rotate(-90°): a=0, b=-1, c=1, d=0
    //   R_inv = rotate(+90°): a=0, b=1, c=-1, d=0
    //   localM = R_inv * T * R
    //   translate(100,0) in local frame = translate(0, -100) [rotated by +90°]
    //   new_tspan = (200 + 0, 300 + (-100)) = (200, 200)
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
    // Rotation kept
    expect(text.getAttribute("transform")).toBe("rotate(-90)");
    const tspan = root.querySelector("#ts")!;
    // The translation in the rotated space: rotate(-(-90°))*(100,0) = rotate(90°)*(100,0)
    // rotate(90°)*(100,0): x'=cos(90)*100-sin(90)*0=0, y'=sin(90)*100+cos(90)*0=100
    // new x = 200+0=200, new y = 300+100=400? Let me verify with the matrix math.
    // R = rotate(-90°): cos(-90)=0, sin(-90)=-1
    // R matrix [a,b,c,d,e,f] = [0, -1, 1, 0, 0, 0]
    // R_inv = [0, 1, -1, 0, 0, 0]
    // A = translate(100,0) = [1,0,0,1,100,0]
    // R_inv * A * R:
    //   Step1: A*R = multiply([1,0,0,1,100,0], [0,-1,1,0,0,0])
    //     C.a = 1*0+0*(-1) = 0
    //     C.b = 0*0+1*(-1) = -1
    //     C.c = 1*1+0*0 = 1
    //     C.d = 0*1+1*0 = 0
    //     C.e = 1*0+0*0+100 = 100
    //     C.f = 0*0+1*0+0 = 0
    //   A*R = [0,-1,1,0,100,0]
    //   Step2: R_inv * (A*R) = multiply([0,1,-1,0,0,0], [0,-1,1,0,100,0])
    //     C.a = 0*0+(-1)*1 = -1... hmm let me redo
    // Actually R_inv = invertPureRotation(R) = [R.a, -R.b, -R.c, R.d, 0, 0]
    //   = [0, -(-1), -(1), 0, 0, 0] = [0, 1, -1, 0, 0, 0]
    //   C.a = 0*0+(-1)*1 = -1 ... this gives -1 for C.a which means scale change?
    // That can't be right for a pure rotation composition. Let me re-examine.
    // R = rotate(-90°): angle = -90° → cos(-90°)=0, sin(-90°)=-1
    // My matrix [a,b,c,d,e,f]: a=cos(θ), b=sin(θ), c=-sin(θ), d=cos(θ)
    // So R = [cos(-90°), sin(-90°), -sin(-90°), cos(-90°), 0, 0]
    //      = [0, -1, 1, 0, 0, 0]
    // R_inv = [R.a, -R.b, -R.c, R.d, 0, 0] = [0, 1, -1, 0, 0, 0]
    //
    // localM = multiply(multiply(R_inv, A), R):
    // R_inv * A = multiply([0,1,-1,0,0,0], [1,0,0,1,100,0])
    //   C.a = 0*1+(-1)*0 = 0
    //   C.b = 1*1+0*0 = 1
    //   C.c = 0*0+(-1)*1 = -1
    //   C.d = 1*0+0*1 = 0
    //   C.e = 0*100+(-1)*0+0 = 0
    //   C.f = 1*100+0*0+0 = 100
    // R_inv * A = [0,1,-1,0,0,100]
    //
    // (R_inv * A) * R = multiply([0,1,-1,0,0,100], [0,-1,1,0,0,0])
    //   C.a = 0*0+(-1)*1 = -1 ... something's wrong
    //
    // Actually I think my invertPureRotation is wrong. For rotation matrix:
    // R = [cos θ, sin θ, -sin θ, cos θ, 0, 0]
    // The ACTUAL inverse should satisfy R * R_inv = identity.
    // For a rotation by θ, the inverse is rotation by -θ:
    // R_inv = [cos(-θ), sin(-θ), -sin(-θ), cos(-θ), 0, 0]
    //       = [cos θ, -sin θ, sin θ, cos θ, 0, 0]
    // So R_inv.a = R.a, R_inv.b = -R.b, R_inv.c = -R.c, R_inv.d = R.d
    // That matches my invertPureRotation: [m[0], -m[1], -m[2], m[3], 0, 0]
    //
    // For R = [0, -1, 1, 0, 0, 0] (rotate -90°):
    // R_inv = [0, -(-1), -(1), 0, 0, 0] = [0, 1, -1, 0, 0, 0] ...
    // Verify: R * R_inv = multiply([0,-1,1,0,0,0], [0,1,-1,0,0,0])
    //   C.a = 0*0+1*1 = 1 ✓
    //   C.b = -1*0+0*1 = 0 ✓
    //   Checks out.
    //
    // So localM should be translate(0, 100) in the rotated space:
    // new x = 200 + 0 = 200, new y = 300 + 100 = 400
    expect(parseFloat(attr(tspan, "x"))).toBeCloseTo(200, 1);
    expect(parseFloat(attr(tspan, "y"))).toBeCloseTo(400, 1);
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
