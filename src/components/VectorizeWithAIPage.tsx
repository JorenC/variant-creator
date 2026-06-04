import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/common/AppHeader";
import { Button } from "@/components/ui/button";
import { ArrowRight, Download } from "lucide-react";

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {number}
      </div>
      <div className="flex-1 pb-8">
        <p className="mb-2 font-semibold">{title}</p>
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">
          {children}
        </div>
      </div>
    </div>
  );
}

export function VectorizeWithAIPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-3xl space-y-14 px-6 py-16">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Step 2
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight">Vectorize with AI</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            This is where your PNG map gets converted into a vector file — a proper, editable
            drawing where each province is a real shape the game can work with. The conversion
            is done by a script that's guided by Claude, Anthropic's AI.
          </p>
        </div>

        {/* ── How it works ────────────────────────────────────────────────────── */}
        <section className="space-y-4 text-base leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">How it works</h2>
          <p>
            Under the hood there's a vectorizer script that analyses your map image and traces the
            province shapes into a vector format. But running that script well requires a bit of
            judgement — every map uses different colours, different border styles, different levels
            of detail — so we use Claude to oversee it.
          </p>
          <p>
            Claude looks at your map, runs the vectorizer, inspects the result, and then adjusts
            the settings to get the best output for your specific map. You don't have to configure
            anything yourself — you just point Claude at your file and let it figure out the rest.
          </p>
          <p>
            In the future we'd like to offer this directly on this website so you don't need to
            install anything. For now, the easiest route is to run it locally using Claude on
            your computer.
          </p>
        </section>

        {/* ── What you need ───────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-2xl font-bold tracking-tight">What you'll need</h2>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
            <li className="flex gap-2">
              <span className="mt-0.5 text-primary">•</span>
              <span>
                <strong>Claude Code</strong> installed on your computer. This is Anthropic's
                command-line tool that lets Claude read and edit files on your machine.
                You can download it from{" "}
                <a
                  href="https://claude.ai/download"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 hover:opacity-70"
                >
                  claude.ai/download
                </a>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-primary">•</span>
              <span>
                <strong>A Claude subscription.</strong> Claude Code requires an active Claude
                Pro or higher subscription. If you don't have one, see the section at the bottom
                of this page.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-primary">•</span>
              <span>
                <strong>Your prepared map</strong> as a PNG file — the cleaned-up version from
                step 1.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-primary">•</span>
              <span>
                <strong>The vectorizer package</strong> — download it using the button below.
              </span>
            </li>
          </ul>

          <div className="pt-2">
            <a href="/vectorizer.zip" download>
              <Button variant="outline">
                <Download className="h-4 w-4" />
                Download vectorizer package
              </Button>
            </a>
          </div>
        </section>

        {/* ── Steps ───────────────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">Running the vectorizer</h2>

          <Step number="1" title="Unzip the package">
            <p>
              Download the vectorizer package above and unzip it to a folder somewhere on your
              computer — your Desktop or Documents folder works fine.
            </p>
          </Step>

          <Step number="2" title="Add your map">
            <p>
              Copy your cleaned PNG map into that folder and rename it exactly{" "}
              <code>map.png</code>. The script looks for a file with that exact name, so the
              capitalisation matters — all lowercase, no spaces.
            </p>
          </Step>

          <Step number="3" title="Open a terminal in that folder">
            <p>
              Open your Terminal (on Mac or Linux) or Command Prompt (on Windows) and navigate
              to the folder you just unzipped. The easiest way is to type <code>cd </code> followed
              by a space, then drag the folder into the terminal window — it'll fill in the path
              for you. Press Enter.
            </p>
          </Step>

          <Step number="4" title="Start Claude">
            <p>
              Type <code>claude</code> and press Enter. Claude Code will start up and show you
              a prompt where you can type messages.
            </p>
          </Step>

          <Step number="5" title="Ask Claude to run the vectorizer">
            <p>Type the following message and press Enter:</p>
            <div className="mt-2 rounded-lg border bg-muted/50 px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
              Run the vectorizer over map.png, and check that the output is correct
            </div>
            <p className="mt-2">
              Claude will run the script, look at what it produced, and make adjustments — for
              example tuning the colour detection to match your map's specific shades, or
              correcting any shapes that didn't trace cleanly. This might take a few minutes and
              Claude may ask you follow-up questions about your map.
            </p>
          </Step>

          <Step number="6" title="Check the result">
            <p>
              When Claude is done, it will tell you the output file is ready. You should find a
              new file called <code>map.svg</code> in the folder — open it in Figma to see your
              vectorized map with the layer structure already set up. Have a look through the
              layers to make sure everything looks right before moving on to step 3.
            </p>
          </Step>
        </section>

        {/* ── No subscription ─────────────────────────────────────────────────── */}
        <section className="space-y-3 rounded-xl border bg-muted/30 p-6 text-sm leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <h2 className="text-lg font-bold text-foreground">Don't have a Claude subscription?</h2>
          <p>
            No problem — one of the Diplicity developers can run the vectorizer for you. Just
            share your cleaned PNG map on the{" "}
            <a
              href="https://discord.gg/TPxS67fw9T"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-4 hover:opacity-70"
            >
              Discord server
            </a>{" "}
            and ask for help in the variants channel. Someone will run it and send you back the
            output file.
          </p>
        </section>

        {/* ── Next step ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Up next</p>
            <p className="mt-0.5 font-semibold">Step 3 — Style and complete the map</p>
          </div>
          <Button onClick={() => navigate("/style-map")}>
            Next step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

      </main>
    </div>
  );
}
