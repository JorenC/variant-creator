import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/common/AppHeader";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Image comparison tabs ────────────────────────────────────────────────────

const COMPARISON_TABS = [
  {
    key: "original",
    label: "Original map",
    src: "/guide/canaan-original.png",
    caption:
      "The original \"Land of Canaan\" by David Cohen. It has everything a finished variant needs — but that's also the problem: names, supply centres, nation colours, a rules panel, and a map legend all mixed into one image.",
  },
  {
    key: "removed",
    label: "What was erased",
    src: "/guide/canaan-removed.png",
    caption:
      "The elements that had to go: province names, supply centre markers, and other decorations. Removing these leaves the AI with nothing to be confused by — just shapes and borders.",
  },
  {
    key: "prepared",
    label: "Ready for AI",
    src: "/guide/canaan-prepared.png",
    caption:
      "The cleaned-up result. Just province areas and border lines — simple, unambiguous, and ready to be vectorized.",
  },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <div className="space-y-3 text-base leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Callout({ variant, children }: { variant: "good" | "bad"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        variant === "good"
          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
          : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      )}
    >
      <p
        className={cn(
          "mb-2 text-sm font-semibold",
          variant === "good"
            ? "text-green-700 dark:text-green-400"
            : "text-red-700 dark:text-red-400"
        )}
      >
        {variant === "good" ? "✓ Aim for this" : "✗ Avoid this"}
      </p>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PreparingMapPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<(typeof COMPARISON_TABS)[number]["key"]>("original");
  const current = COMPARISON_TABS.find(t => t.key === activeTab)!;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-3xl space-y-16 px-6 py-16">

        {/* ── Page header ─────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Step 1
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight">Preparing your map</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Before anything else can happen, your map needs to be in the right format. This step
            explains what that means and how to get there — no coding or technical knowledge needed.
          </p>
        </div>

        {/* ── What is a vector ────────────────────────────────────────────────── */}
        <Section title="What is a vector image?">
          <p>
            Most images you'll have — photos, scanned drawings, screenshots — are{" "}
            <strong>raster</strong> images. They're made up of a grid of tiny coloured dots called
            pixels. Zoom in far enough and it gets blurry. More importantly, the computer just sees
            colours; it has no idea which blob of pixels is a province and which is the sea.
          </p>
          <p>
            A <strong>vector</strong> image works differently. Instead of pixels, it stores
            mathematical descriptions of shapes: "draw a line from here to there", "fill this
            closed area with this colour". Vector shapes stay sharp at any size, and — most
            importantly for Diplicity — each shape can be named and treated as an individual
            object. That's exactly what the game engine needs.
          </p>
          <p>
            The goal of this whole process is to end up with a vector file where each province
            is a distinct, named shape. This step is about preparing your source image so the
            AI conversion goes as smoothly as possible.
          </p>
        </Section>

        {/* ── Good input ──────────────────────────────────────────────────────── */}
        <Section title="What makes a good input map?">
          <p>
            The AI traces the shapes it can see. The cleaner and simpler the image, the more
            accurately it can do that. Here's a quick guide:
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Callout variant="good">
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Clear, consistent border lines between provinces</li>
                <li>Obvious colour difference between land and sea</li>
                <li>Simple, flat fill colours</li>
                <li>Nothing overlapping the province shapes</li>
              </ul>
            </Callout>
            <Callout variant="bad">
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Province names and text labels</li>
                <li>Supply centre markers or unit symbols</li>
                <li>Rivers, roads, or decorative elements</li>
                <li>Rules panels, legends, or titles</li>
              </ul>
            </Callout>
          </div>
          <p className="mt-2">
            None of this is permanent. Names, supply centres, and rivers all come back in later
            steps. Right now we just need to give the AI a clean image to read.
          </p>
        </Section>

        {/* ── Layers ──────────────────────────────────────────────────────────── */}
        <Section title="Working with layers">
          <p>
            If you're creating your map from scratch, the best approach is to use software that
            supports <strong>layers</strong>. Think of layers like transparent sheets of glass
            stacked on top of each other — each one holds a different part of the image. You might
            have one sheet for province fills, one for border lines, one for names, one for supply
            centres, and so on.
          </p>

          <div className="my-2 flex gap-5 rounded-xl border p-4 shadow-sm">
            <img
              src="/guide/layers.png"
              alt="Layer panel showing names, borders, and background layers stacked in software"
              className="w-32 shrink-0 self-start rounded-lg border object-contain"
            />
            <p className="text-sm leading-relaxed">
              A typical layer panel in image editing software. Each part of the map sits on its
              own layer — you can see <em>names</em>, <em>borders</em>, and the base map listed
              separately. Hide the ones you don't want, export the rest. No erasing, no redrawing
              — just click the eye icon next to a layer to toggle it off.
            </p>
          </div>
          <p>
            Some good free tools that support layers:
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
            <li>
              <strong>GIMP</strong> — free, works on Windows, Mac, and Linux.
              Great for pixel-based (raster) images.
            </li>
            <li>
              <strong>Inkscape</strong> — free, all platforms.
              Works natively with vector files and is what Diplicity maps are ultimately built in.
            </li>
            <li>
              <strong>Photoshop / Illustrator</strong> — professional and paid, but works well
              if you already have access.
            </li>
          </ul>
        </Section>

        {/* ── Canaan example ──────────────────────────────────────────────────── */}
        <Section title="A real example: Land of Canaan">
          <p>
            Throughout this guide we'll use <strong>"Land of Canaan"</strong> by David Cohen as
            our example — a Diplomacy variant set in the ancient Middle East.
          </p>
          <p>
            David's map wasn't built with separate layers, so we couldn't just hide one. Instead
            we had to manually erase everything we didn't need: the province names, supply centre
            markers, nation colour fills, and the rules text box in the corner. What was left is a
            clean map the AI can reliably read.
          </p>
          <p>
            Use the buttons below to compare the original map, the elements that were removed,
            and the prepared version.
          </p>

          <div className="mt-6">
            <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
              {COMPARISON_TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    activeTab === tab.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-2 overflow-hidden rounded-xl border shadow-sm">
              <img
                key={current.key}
                src={current.src}
                alt={current.label}
                className="w-full"
              />
              <p className="border-t bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                {current.caption}
              </p>
            </div>
          </div>
        </Section>

        {/* ── Quality note ────────────────────────────────────────────────────── */}
        <Section title="Better input means less cleanup">
          <p>
            The AI is good, but it's not perfect — and some map styles make its job harder.
            Using different colours for different nations, decorative or uneven borders, heavy
            textures or shading can all confuse it. It might miss a border that blends into the
            background, or interpret a colour fill as a shape boundary.
          </p>
          <p>
            The ideal input looks more like a technical diagram than an artistic map: a single
            neutral land colour, a clear sea colour, and thin consistent lines for borders —
            similar to the cleaned-up Canaan map. The simpler it is, the better the AI performs.
          </p>
          <p>
            In the next step you'll run the image through Claude. If something doesn't trace
            correctly you can always adjust your input and try again — but the better your
            starting point, the less back-and-forth you'll need.
          </p>
        </Section>

        {/* ── Borders note ────────────────────────────────────────────────────── */}
        <Section title="Don't worry about perfect borders">
          <p>
            One reassuring thing: in the final game, province borders are{" "}
            <strong>randomised slightly</strong> to make them look like natural terrain rather
            than rigid geometric lines. Diplicity doesn't need (or want) a mathematically precise
            border from you.
          </p>
          <p>
            What matters is that the <em>shape</em> of each province is roughly right — that
            provinces are clearly separated from their neighbours and that borders connect where
            they should. Small imperfections in your drawing will be smoothed out, not preserved.
            So don't agonise over getting every curve exactly right.
          </p>
        </Section>

        {/* ── Next step ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Up next</p>
            <p className="mt-0.5 font-semibold">Step 2 — Vectorize with AI</p>
          </div>
          <Button onClick={() => navigate("/vectorize-with-ai")}>
            Next step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

      </main>
    </div>
  );
}
