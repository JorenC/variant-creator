import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Layers, FileCode2, FileJson, Upload, Pencil } from "lucide-react";
import { AppHeader } from "@/components/common/AppHeader";

interface MapTile {
  src: string;
  label: string;
  area: string;
}

const MOSAIC: MapTile[] = [
  { src: "/maps/coldwar.png",   label: "Cold War",           area: "coldwar"  },
  { src: "/maps/hundred.png",   label: "Hundred Years' War", area: "hundred"  },
  { src: "/maps/south.png",     label: "West Africa",        area: "south"    },
  { src: "/maps/vietnam.png",   label: "Vietnam",            area: "vietnam"  },
  { src: "/maps/classical.png", label: "Classical",          area: "classical" },
  { src: "/maps/spice.png",     label: "Spice Islands",      area: "spice"    },
];

// ─── Guide sections ────────────────────────────────────────────────────────────

interface GuideSectionProps {
  id: string;
  number?: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function GuideSection({ id, number, icon, title, children }: GuideSectionProps) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-start gap-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="flex-1">
          {number && (
            <p className="mb-0.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Step {number}
            </p>
          )}
          <h2 className="mb-4 text-2xl font-bold">{title}</h2>
          {children}
        </div>
      </div>
    </section>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">

      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <AppHeader
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => navigate("/dsvg-creator")}>
              dSVG Creator
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate("/dvar-creator")}>
              dVAR Creator
            </Button>
            <Button size="sm" onClick={() => navigate("/upload-diplicity")}>
              Upload
            </Button>
          </>
        }
      />

      <main>
        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-10 lg:grid-cols-[3fr_2fr] lg:items-center">

            {/* ── Map mosaic (left) ──────────────────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl shadow-2xl">
              {/* Desktop: named-area grid */}
              <div
                className="hidden gap-1.5 lg:grid"
                style={{
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gridTemplateRows: "150px 150px 150px",
                  gridTemplateAreas: `
                    "coldwar coldwar hundred"
                    "south   vietnam  hundred"
                    "classical spice  spice"
                  `,
                }}
              >
                {MOSAIC.map(({ src, label, area }) => (
                  <div
                    key={area}
                    className="group relative overflow-hidden"
                    style={{ gridArea: area }}
                  >
                    <img
                      src={src}
                      alt={label}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2.5 py-1 text-xs font-semibold text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Mobile: simple 2-column grid */}
              <div className="grid grid-cols-2 gap-1.5 lg:hidden">
                {MOSAIC.map(({ src, label }) => (
                  <div key={label} className="relative aspect-video overflow-hidden">
                    <img src={src} alt={label} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Text (right) ───────────────────────────────────────────────── */}
            <div className="flex flex-col items-start">
              <img
                src="/diplicity-icon.png"
                alt="Diplicity"
                className="mb-5 h-14 w-14 rounded-2xl shadow-lg"
              />
              <h1 className="mb-4 text-4xl font-bold tracking-tight xl:text-5xl">
                Create Custom Diplomacy Variants
              </h1>
              <p className="mb-8 text-lg text-muted-foreground">
                Design maps, define game rules, and publish playable Diplomacy
                variants directly to Diplicity.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={() => navigate("/dsvg-creator")}>
                  dSVG Creator
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate("/dvar-creator")}>
                  dVAR Creator
                </Button>
              </div>
            </div>

          </div>
        </section>

        {/* ── Divider ─────────────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-7xl px-6">
          <div className="border-t" />
        </div>

        {/* ── Guide sections ───────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-3xl space-y-20 px-6 py-20">

          {/* ── Intro blurb ───────────────────────────────────────────────────── */}
          <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              You can make your own variant here. This creator helps you go through
              the steps — if you have any issue, hop on to{" "}
              <a
                href="https://discord.gg/Z74vHN9H"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                Discord
              </a>{" "}
              and ask for help.
            </p>
            <p>
              The Diplicity engine takes two files: the{" "}
              <span className="font-medium text-foreground">dSVG</span> — an SVG file
              that follows certain conventions like names of layers and objects — and
              a{" "}
              <span className="font-medium text-foreground">dVAR</span> — the
              metadata: description of nations, adjacencies, supply centers, etc.
              This site helps you go from a drawing or PNG to a final uploadable
              version.
            </p>
            <p>
              Each step can be done manually if you want creative freedom, but
              it's easier and more foolproof to do it with this creator.
            </p>
          </div>

          <GuideSection id="prepare-map" number="1" icon={<Pencil className="h-4 w-4" />} title="Prepare a PNG map">
            <p className="text-muted-foreground leading-relaxed">
              You start by drawing your map, which we'll let AI trace and make into a
              vectorized SVG. This step can be skipped if you're working with an SVG
              as starting document.
            </p>
            <button
              type="button"
              onClick={() => navigate("/preparing-your-map")}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:opacity-70"
            >
              How to prepare my map
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </GuideSection>

          <GuideSection id="map-extraction" number="2" icon={<Layers className="h-4 w-4" />} title="Vectorize with AI">
            <p className="text-muted-foreground leading-relaxed">
              Run the vectorizer script over your PNG using Claude. Claude will trace your province
              shapes, set up the correct layer structure, and tweak the settings to fit your map's
              specific colours and style.
            </p>
            <button
              type="button"
              onClick={() => navigate("/vectorize-with-ai")}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:opacity-70"
            >
              How to vectorize with AI
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </GuideSection>

          <GuideSection id="style-map" number="3" icon={<Layers className="h-4 w-4" />} title="Style and complete the map">
            <p className="text-muted-foreground leading-relaxed">
              Check and organise the seven layers the ingestor expects — background, provinces,
              named coasts, unit positions, names, borders, and foreground — then style your map
              to look the way you want.
            </p>
            <button
              type="button"
              onClick={() => navigate("/style-map")}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:opacity-70"
            >
              How to style and complete the map
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </GuideSection>

          <GuideSection id="dsvg-creation" number="4" icon={<FileCode2 className="h-4 w-4" />} title="dSVG Creation">
            <p className="text-muted-foreground leading-relaxed">
              Use the dSVG Creator to assign SVG layers to canonical roles (provinces,
              named coasts, unit positions, province names, borders), configure province
              abbreviations, and export a <span className="font-mono text-xs">.d.svg</span> file
              that Diplicity can parse.
            </p>
            <Button
              className="mt-5"
              onClick={() => navigate("/dsvg-creator")}
            >
              Open dSVG Creator
              <ArrowRight className="h-4 w-4" />
            </Button>
          </GuideSection>

          <GuideSection id="dvar-creation" number="5" icon={<FileJson className="h-4 w-4" />} title="dVAR Creation">
            <p className="text-muted-foreground leading-relaxed">
              Use the dVAR Creator to define nations, provinces, adjacencies, home
              centers, phase progression, victory conditions, and game-rule modifiers.
              Export a <span className="font-mono text-xs">.dvar</span> file that encodes
              all variant rules.
            </p>
            <Button
              className="mt-5"
              onClick={() => navigate("/dvar-creator")}
            >
              Open dVAR Creator
              <ArrowRight className="h-4 w-4" />
            </Button>
          </GuideSection>

          <GuideSection id="uploading" number="6" icon={<Upload className="h-4 w-4" />} title="Uploading to Diplicity">
            <div className="mb-5 flex items-center gap-3">
              <img
                src="/diplicity-icon.png"
                alt="Diplicity"
                className="h-10 w-10 rounded-xl shadow"
              />
              <div>
                <p className="font-semibold">Diplicity</p>
                <a
                  href="https://www.diplicity.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  diplicity.com
                </a>
              </div>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              How to submit your <span className="font-mono text-xs">.d.svg</span> and{" "}
              <span className="font-mono text-xs">.dvar</span> files to the Diplicity
              platform so other players can join and play your custom variant.
            </p>
            <Button
              className="mt-5"
              onClick={() => navigate("/upload-diplicity")}
            >
              Upload to Diplicity
              <ArrowRight className="h-4 w-4" />
            </Button>
          </GuideSection>

        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────────── */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-6 text-sm text-muted-foreground">
          <img src="/diplicity-icon.png" alt="" className="h-4 w-4 opacity-50" />
          <span>
            Built for{" "}
            <a
              href="https://www.diplicity.com"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Diplicity
            </a>
          </span>
        </div>
      </footer>

    </div>
  );
}
