import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/common/AppHeader";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertTriangle } from "lucide-react";
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
            Now it's time to check, clean up, and style everything before moving on.
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
          <h2 className="text-2xl font-bold tracking-tight">The seven layers</h2>
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
    </div>
  );
}
