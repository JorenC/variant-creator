import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Layers, FileCode2, FileJson, Upload } from "lucide-react";

const NAV_SECTIONS = [
  { label: "Instructions", href: "#instructions" },
  { label: "Map Extraction", href: "#map-extraction" },
  { label: "dSVG Creation", href: "#dsvg-creation" },
  { label: "dVAR Creation", href: "#dvar-creation" },
  { label: "Uploading", href: "#uploading" },
] as const;

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
  number: string;
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
          <p className="mb-0.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Step {number}
          </p>
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
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <img src="/diplicity-icon.png" alt="Diplicity" className="h-7 w-7 rounded" />
            <span className="font-semibold tracking-tight">Variant Creator</span>
          </div>

          <nav className="hidden lg:flex items-center gap-6 ml-4">
            {NAV_SECTIONS.map(s => (
              <a
                key={s.href}
                href={s.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground whitespace-nowrap"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => navigate("/dsvg-creator")}>
              dSVG Creator
            </Button>
            <Button size="sm" onClick={() => navigate("/dvar-creator")}>
              dVAR Creator
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 pt-16 pb-12">
          <div className="mb-10 flex flex-col items-center text-center">
            <img
              src="/diplicity-icon.png"
              alt="Diplicity"
              className="mb-6 h-16 w-16 rounded-2xl shadow-lg"
            />
            <h1 className="mb-4 text-5xl font-bold tracking-tight lg:text-6xl">
              Create Custom<br />Diplomacy Variants
            </h1>
            <p className="mb-8 max-w-xl text-lg text-muted-foreground">
              Design maps, define game rules, and publish playable Diplomacy
              variants directly to Diplicity.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={() => navigate("/dsvg-creator")}>
                dSVG Creator
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/dvar-creator")}>
                dVAR Creator
              </Button>
            </div>
          </div>

          {/* ── Map mosaic ──────────────────────────────────────────────────── */}
          <div
            className="hidden gap-1.5 overflow-hidden rounded-2xl shadow-2xl md:grid"
            style={{
              gridTemplateColumns: "repeat(3, 1fr)",
              gridTemplateRows: "210px 210px 210px",
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
          <div className="grid grid-cols-2 gap-1.5 overflow-hidden rounded-2xl md:hidden">
            {MOSAIC.map(({ src, label, area }) => (
              <div key={area} className="relative aspect-video overflow-hidden">
                <img
                  src={src}
                  alt={label}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Divider ─────────────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-7xl px-6">
          <div className="border-t" />
        </div>

        {/* ── Guide sections ───────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-3xl space-y-20 px-6 py-20">

          <GuideSection id="instructions" number="1" icon={<BookOpen className="h-4 w-4" />} title="Instructions">
            <p className="text-muted-foreground leading-relaxed">
              An overview of the full workflow for creating a Diplomacy variant — from
              preparing your map image, through building the dSVG and dVAR files, to
              uploading the finished variant to Diplicity.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Content coming soon.
            </p>
          </GuideSection>

          <GuideSection id="map-extraction" number="2" icon={<Layers className="h-4 w-4" />} title="Map Extraction">
            <p className="text-muted-foreground leading-relaxed">
              How to import your map into Inkscape, separate province regions into
              individual paths, add named-coast and unit-position layers, and export
              a clean SVG ready for the dSVG Creator.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Content coming soon.
            </p>
          </GuideSection>

          <GuideSection id="dsvg-creation" number="3" icon={<FileCode2 className="h-4 w-4" />} title="dSVG Creation">
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

          <GuideSection id="dvar-creation" number="4" icon={<FileJson className="h-4 w-4" />} title="dVAR Creation">
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

          <GuideSection id="uploading" number="5" icon={<Upload className="h-4 w-4" />} title="Uploading to Diplicity">
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
            <p className="mt-3 text-sm text-muted-foreground">
              Content coming soon.
            </p>
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
