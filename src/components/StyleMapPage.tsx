import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/common/AppHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, AlertTriangle, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Layer card data ──────────────────────────────────────────────────────────

interface LayerInfo {
  name: string;
  label: string;
  accent: string;
  description: string;
  details: React.ReactNode;
  warning?: React.ReactNode;
}

const LAYERS: LayerInfo[] = [
  {
    name: "background",
    label: "Background",
    accent: "border-l-stone-400",
    description:
      "Everything in this layer sits behind all other layers. Diplicity simply copies it and displays it as-is — the game engine doesn't interpret it in any way.",
    details: (
      <>
        <p>
          Use this for the visual base of your map: the sea colour, terrain textures, decorative
          borders around the map edge, a compass rose, anything you like. There are no rules here —
          go as detailed or as minimal as you want.
        </p>
      </>
    ),
  },
  {
    name: "provinces",
    label: "Provinces",
    accent: "border-l-blue-400",
    description:
      "One object per province. This is the most important layer — it tells the game where each province is and what shape it has.",
    details: (
      <>
        <p>
          Each province should be a single closed shape (or a group if it's made up of multiple
          parts, like an island nation). The shape covers the full area of that province.
        </p>
        <p className="mt-2">
          <strong>Naming convention:</strong> double-click each object in your layer panel and rename
          it to the three-letter abbreviation for that province, in{" "}
          <strong>lowercase</strong> — for example <code className="rounded bg-muted px-1 py-0.5 text-xs">kie</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">lon</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">par</code>.
          This isn't strictly required, but it makes the dSVG creation step much easier — these
          names become the source of truth for the whole variant.
        </p>
        <p className="mt-2">
          <strong>These shapes are not rendered visually in the final map.</strong> Diplicity uses
          them only to know which area belongs to which province — for example when highlighting or
          colouring a province during gameplay. The fills and colours you see here won't show up for
          players. For the visual appearance of your provinces, use the <strong>background</strong> layer.
        </p>
      </>
    ),
  },
  {
    name: "named-coasts",
    label: "Named coasts",
    accent: "border-l-cyan-400",
    description:
      "Only needed if your map has provinces with named coasts — provinces where a fleet can be in two distinct positions (like Spain's north and south coasts in standard Diplomacy).",
    details: (
      <>
        <p>
          For each such province, add <strong>two separate objects</strong> — one covering the
          northern half of the province, one covering the southern half (or west/east, depending on
          your map's geography). These should be actual shapes, not copies of the full province.
        </p>
        <p className="mt-2">
          <strong>Naming convention:</strong>{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">province/coast</code> in lowercase —
          for example <code className="rounded bg-muted px-1 py-0.5 text-xs">spa/nc</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">spa/sc</code> for Spain's north
          and south coasts.
        </p>
        <p className="mt-2">
          Like the provinces layer, <strong>these shapes are not rendered visually</strong> — they
          only define the areas Diplicity uses for coast-specific colouring and targeting during
          gameplay. Put any visual styling for those areas in the <strong>background</strong> layer.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Our Land of Canaan example has no named coasts, so you can skip this layer for now.
        </p>
        <p className="mt-2 text-xs text-muted-foreground/70 italic">
          It could be that there's a small empty object labelled{" "}
          <code className="rounded bg-muted px-1 py-0.5 not-italic">DELETE THIS</code> in this
          layer — the AI sometimes adds one as a placeholder so the layer exists in the file even
          when empty. If you see it, just delete it in Figma.
        </p>
      </>
    ),
  },
  {
    name: "unit-positions",
    label: "Unit positions",
    accent: "border-l-amber-400",
    description:
      "Markers that tell the game engine exactly where to draw a unit inside each province — one marker per province, and one for every named coast too.",
    details: (
      <>
        <p>
          The AI has already placed a unit-position marker at the centre of each province, so
          you don't need to create them from scratch. Go through the layer and nudge any markers
          that landed in an awkward spot — for example, if the calculated centre falls in the sea
          for a coastal province, drag it a little inland.
        </p>
        <p className="mt-2">
          If you added any named coasts, you'll need to add those markers yourself: place a small
          circle (around 10×10 px) inside each coast shape at the position where you want the
          unit to appear.
        </p>
        <p className="mt-2">
          <strong>Naming convention:</strong> use the same three-letter abbreviation as the
          province, but in <strong>uppercase</strong> —{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">KIE</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">LON</code>. For named coasts,
          use <code className="rounded bg-muted px-1 py-0.5 text-xs">SPA/NC</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">SPA/SC</code>.
        </p>
      </>
    ),
    warning: (
      <p>
        <strong>Every province and every named coast must have exactly one unit-position
        object.</strong> If any are missing the dSVG Creator will throw an error later. Count
        your objects against your province list before moving on.
      </p>
    ),
  },
  {
    name: "names",
    label: "Province names",
    accent: "border-l-violet-400",
    description:
      "Text labels showing the name of each province on the map. Keeping them in a separate layer lets Diplicity show or hide province names independently.",
    details: (
      <>
        <p>
          Add a text object for each province with its full display name — "Kiel", "London",
          "Paris", etc. Place it somewhere readable inside the province. Font, size, and colour
          are all up to you.
        </p>
        <p className="mt-2">
          <strong>Use a font from{" "}
          <a
            href="https://fonts.google.com"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:opacity-70"
          >
            Google Fonts
          </a>.</strong>{" "}
          This is important for portability — when the map is displayed in Diplicity, the font
          needs to load correctly for all players. Google Fonts are freely available and can be
          embedded in the exported file. If you use a font that isn't on Google Fonts, other
          players may see a fallback font instead and your map may look different from what you
          designed.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          These are the names players will see in the game, so use the spellings you want to
          appear on screen.
        </p>
        <p className="mt-2 text-xs text-muted-foreground/70 italic">
          It could be that there's a small empty object labelled{" "}
          <code className="rounded bg-muted px-1 py-0.5 not-italic">DELETE THIS</code> in this
          layer — the AI sometimes adds one as a placeholder so the layer exists in the file even
          when empty. If you see it, just delete it in Figma.
        </p>
        <p className="mt-2">
          If you want to add <strong>ornamental names</strong> — for example in a different
          script, a stylised calligraphy font, or with decorative flourishes — it's usually
          better to place those in a separate group inside the <strong>foreground</strong> layer
          instead. The names layer is used by Diplicity to toggle labels on and off during
          gameplay, so it works best with clean, readable text. Ornamental versions are purely
          visual decoration and don't need to be toggled, so the foreground layer is a more
          natural home for them.
        </p>
      </>
    ),
  },
  {
    name: "borders",
    label: "Borders",
    accent: "border-l-emerald-400",
    description:
      "The border lines drawn between provinces. Again, a dedicated layer so Diplicity can toggle them independently.",
    details: (
      <>
        <p>
          The AI has already created a borders layer for you, extracted from the lines in your
          original map. You should have a ready-to-use set of border paths — check that they look
          right and adjust any that are missing or misplaced.
        </p>
        <p className="mt-2">
          Style them however you like — thickness, colour, dashes. If your province shapes
          already have visible outlines, you may be able to use those directly instead.
        </p>
      </>
    ),
  },
  {
    name: "scs",
    label: "Supply centres",
    accent: "border-l-yellow-400",
    description:
      "The visual symbols that mark supply centre provinces on the map. Technically optional as a separate layer — but worth having.",
    details: (
      <>
        <p>
          The ingestor will automatically move supply centre symbols into the foreground when
          it processes your map, so this layer isn't strictly required. That said, keeping them
          separate makes your file much easier to work with — you can hide or adjust all SC
          symbols at once without touching anything else.
        </p>
        <p className="mt-2">
          Draw your SC marker for each supply centre province here. There are no technical
          constraints on what these look like — a classic star, a cross, a shield, an ornate
          seal — go as creative as you like. This is one of the best places to add personality
          to your map.
        </p>
      </>
    ),
  },
  {
    name: "foreground",
    label: "Foreground",
    accent: "border-l-rose-400",
    description:
      "Like the background layer — Diplicity copies everything here as-is — but displayed on top of all other layers, except units and orders.",
    details: (
      <>
        <p>
          Use this for decorative details that should sit above the province colours and borders:
          ornamental map edges, illustrations, a title cartouche, anything visual you want on top.
        </p>
        <p className="mt-2 text-xs text-muted-foreground/70 italic">
          It could be that there's a small empty object labelled{" "}
          <code className="rounded bg-muted px-1 py-0.5 not-italic">DELETE THIS</code> in this
          layer — the AI sometimes adds one as a placeholder so the layer exists in the file even
          when empty. If you see it, just delete it in Figma.
        </p>
        <p className="mt-2">
          There's one practical use beyond decoration:{" "}
          <strong>covering island provinces with sea.</strong> If you have an island province,
          you can place a sea-coloured shape in the foreground layer that overlaps the island's
          highlight area. This sea shape will be drawn over any highlighted province colour,
          keeping the waters looking correct during gameplay.
        </p>
      </>
    ),
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function LayerCard({ layer }: { layer: LayerInfo }) {
  return (
    <div className={cn("rounded-xl border border-l-4 bg-card p-5 shadow-sm", layer.accent)}>
      <div className="mb-3 flex items-center gap-2">
        <code className="rounded bg-muted px-2 py-0.5 text-sm font-semibold tracking-tight">
          {layer.name}
        </code>
        <span className="text-sm font-medium text-muted-foreground">{layer.label}</span>
      </div>
      <p className="mb-3 text-sm font-medium leading-relaxed">{layer.description}</p>
      <div className="space-y-1 text-sm leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_code]:font-mono">
        {layer.details}
      </div>
      {layer.warning && (
        <div className="mt-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="leading-relaxed [&_strong]:font-semibold">{layer.warning}</div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StyleMapPage() {
  const navigate = useNavigate();
  const [showExample, setShowExample] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-3xl space-y-12 px-6 py-16">

        {/* ── Page header ─────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Step 3
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight">Style and complete the map</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            At this point the AI has turned your image into a vector file — your provinces are now
            real shapes the computer can understand. It's also set up the correct layer structure.
            Now it's time to check, clean up, and style everything before moving on. This is the
            most fun part, but it can be tedious. Knowing how vector editing works helps a lot.
          </p>
        </div>

        {/* ── Intro ───────────────────────────────────────────────────────────── */}
        <section className="space-y-3 text-base leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <p>
            The Diplicity ingestor — the part of the system that reads your map file — expects a
            specific set of layers, each with a specific purpose. Think of it like a filing system:
            each type of element goes in its own drawer, so the game engine knows exactly where to
            look for provinces, names, borders, and so on.
          </p>
          <p>
            The AI has already created these layers for you. Your job now is to go through them,
            make sure the right objects are in the right places, and add anything that's missing.
            Below is what each layer is for.
          </p>
        </section>

        {/* ── Layer cards ─────────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight">The eight layers</h2>
          <div className="space-y-4">
            {LAYERS.map(layer => (
              <LayerCard key={layer.name} layer={layer} />
            ))}
          </div>
        </section>

        {/* ── Cleanup note ────────────────────────────────────────────────────── */}
        <section className="space-y-3 text-base leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Before you move on</h2>
          <p>
            Take a moment to go through each layer and check:
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-sm">
            <li>Every province has exactly one shape in the <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">provinces</code> layer.</li>
            <li>Province objects are named with their three-letter abbreviation (lowercase).</li>
            <li>Every province <em>and</em> every named coast has a unit-position marker.</li>
            <li>Unit-position objects are named with the uppercase abbreviation.</li>
            <li>Named-coast shapes use the <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">province/coast</code> naming format.</li>
          </ul>
          <p>
            If anything was missed or misplaced by the AI, now is the time to fix it. Small
            corrections here save a lot of back-and-forth later.
          </p>
        </section>

        {/* ── Export ──────────────────────────────────────────────────────────── */}
        <section className="rounded-xl border p-6 shadow-sm">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">Exporting your map</h2>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <img
              src="/guide/export.png"
              alt="Figma export settings panel showing 'Include id attribute' checked and SVG format selected"
              className="w-full rounded-lg border sm:w-80 sm:shrink-0"
            />
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
              <p>
                When you're happy with your map, it's time to export it as an SVG file, ready for
                the dSVG Creator.
              </p>
              <p>Before you export, run through these checks:</p>
              <ul className="list-inside list-disc space-y-1.5">
                <li>
                  Every object has either a <strong>fill</strong> or a <strong>stroke</strong> — objects
                  with neither will disappear from the exported file.
                </li>
                <li>
                  No layers or objects are <strong>hidden</strong> (eye icon off) — hidden elements
                  are not exported and will be missing from the final map.
                </li>
                <li>
                  In the export settings, make sure <strong>"Include id attribute"</strong> is
                  checked. This is what lets the dSVG Creator read your province names — without it,
                  all the renaming you did will be lost.
                </li>
              </ul>
              <p>
                Then select <strong>SVG</strong> as the format and export. That file is what you'll
                load into the dSVG Creator in the next step.
              </p>
            </div>
          </div>
        </section>

        {/* ── Canaan example link ─────────────────────────────────────────────── */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowExample(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:opacity-70"
          >
            See the Land of Canaan as a worked example
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Next step ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Up next</p>
            <p className="mt-0.5 font-semibold">Step 4 — dSVG Creation</p>
          </div>
          <Button onClick={() => navigate("/dsvg-creator")}>
            Next step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

      </main>

      {/* ── Canaan example dialog ─────────────────────────────────────────────── */}
      <Dialog open={showExample} onOpenChange={setShowExample}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Land of Canaan — worked example</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Download the finished Figma SVG for the Land of Canaan to see a complete, export-ready
            map. Compare it against your own work to make sure everything looks right.
          </p>

          <a href="/guide/canaan-example.svg" download="canaan-example.svg">
            <Button variant="outline" className="w-full">
              <Download className="h-4 w-4" />
              Download canaan-example.svg
            </Button>
          </a>

          <div className="mt-2 space-y-8 text-sm leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">

            {/* 1. Border cleanup */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">1. Cleaned up the borders</h3>
              <p>
                The AI traced the borders directly from the PNG, which left some errors. I manually
                selected individual borders (and checked the corresponding shapes in the provinces
                layer) and deleted the parts that were wrong.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <img
                    src="/guide/canaan-borders-before.png"
                    alt="Borders before cleanup"
                    className="w-full rounded-lg border"
                  />
                  <p className="mt-1 text-center text-xs text-muted-foreground">Before</p>
                </div>
                <div>
                  <img
                    src="/guide/canaan-borders-after.png"
                    alt="Borders after cleanup"
                    className="w-full rounded-lg border"
                  />
                  <p className="mt-1 text-center text-xs text-muted-foreground">After</p>
                </div>
              </div>
            </div>

            {/* 2. Oasis provinces */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">2. Redrawn oasis provinces with a gradient</h3>
              <p>
                The original map had three small circular oasis provinces in the desert that I
                wanted to change. I deleted them and their respective borders, then manually
                redrew provinces to fill the full desert area. To give the desert a sense of
                depth, I applied a gradient fill over their respective borders, making the region
                feel visually distinct from the rest of the map.
              </p>
              <img
                src="/guide/canaan-oasis.png"
                alt="Redrawn oasis provinces with gradient fills"
                className="w-full rounded-lg border"
              />
            </div>

            {/* 3. Outlined text */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">3. Proto-Hebrew labels with outlined text</h3>
              <p>
                I added Proto-Hebrew script as ornamental province labels in the foreground layer.
                Because this font is highly unusual and not available on Google Fonts, it isn't
                reliably loaded for all players. I outlined the strokes, ensuring the text is
                visible without requiring any font: right-click each text layer in Figma and
                select <strong>"Outline stroke"</strong>. This converts the text into vector
                shapes — the glyphs are drawn directly.
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <strong>Important:</strong> text outlining bloats the SVG size, and outlined text
                can no longer be edited. Save a copy of your file before doing this. If your font
                is on Google Fonts, skip this step — we'll link the font during export instead,
                which keeps the file smaller and faster to load.
              </div>
              <img
                src="/guide/figma-outline-text.png"
                alt="Figma context menu with Outline stroke highlighted"
                className="mx-auto w-56 rounded-lg border"
              />
            </div>

          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
