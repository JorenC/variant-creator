import { AppHeader } from "@/components/common/AppHeader";

export function UploadDiplicityPage() {
  return (
    <>
      <AppHeader />
      <div className="flex min-h-screen flex-col items-center p-8">
        <div className="flex w-full max-w-3xl flex-col gap-8">
          <div>
            <h1 className="text-3xl font-bold">Upload to Diplicity</h1>
            <p className="mt-2 text-muted-foreground">
              Your variant is ready to be shared with the world.
            </p>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Uploading your variant</h2>
            <p>
              Head over to{" "}
              <a
                href="http://www.diplicity.com/variants"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                diplicity.com/variants
              </a>{" "}
              and click <strong>Upload variant</strong>. Upload the{" "}
              <span className="font-mono text-sm">.dvar</span> (JSON) and{" "}
              <span className="font-mono text-sm">.d.svg</span> files you
              exported from this tool, then click <strong>Upload draft</strong>.
            </p>
            <div className="overflow-hidden rounded-lg border">
              <img
                src="/guide/diplicity-upload.png"
                alt="The Upload variant form on diplicity.com/variants"
                className="w-full"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Testing with a Sandbox</h2>
            <p>
              Once uploaded, you can start a{" "}
              <strong>Sandbox game</strong> directly from the{" "}
              <a
                href="http://www.diplicity.com/variants"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                diplicity.com/variants
              </a>{" "}
              page. A Sandbox lets you step through turns and verify that the
              map, adjacency, and rules all work the way you intend — before
              sharing it with anyone else.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Play your variant privately</h2>
            <p>
              From the{" "}
              <a
                href="http://www.diplicity.com/variants"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                diplicity.com/variants
              </a>{" "}
              page you can now start a &ldquo;Create game&rdquo; flow with your
              variant selected. This will be set to private. You can choose to
              be one of the players and invite others, or be a Game Master and
              not play but observe the game (note: GM is still MVP — you can
              kick staging players and pause the game, but not chat with other
              players yet).
            </p>
            <p>
              Whether you play as GM or player, use the{" "}
              <strong>Share &amp; Invite</strong> link inside the staging game
              to invite players directly.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Updating your variant</h2>
            <p>
              Found something that needs fixing? Re-export your{" "}
              <span className="font-mono text-sm">.dvar</span> and{" "}
              <span className="font-mono text-sm">.d.svg</span> from this tool,
              then go back to{" "}
              <a
                href="http://www.diplicity.com/variants"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                diplicity.com/variants
              </a>{" "}
              and use the <strong>Edit</strong> option on your variant to upload
              the new files.
            </p>
            <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">
              <strong>Heads-up:</strong>{" "}Uploading a new version will destroy
              any Sandbox games you&apos;ve started with the previous version.
              Make sure you&apos;ve finished testing before you overwrite.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Getting your variant published</h2>
            <p>
              If your variant is working well and you&apos;d like it to become
              part of the public Diplicity roster — playable by everyone — you
              can apply to have it published as a community variant. Note that
              you first need to have completed four playtests of your map, to
              ensure there is time to find bugs. When you have four completed
              games on Diplicity, you can use this{" "}
              <a
                href="https://forms.gle/fFAMcaybtivnFsjc9"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Google Form
              </a>
              . This will send us a message and we will publish it for you.
            </p>
            <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">
              To keep the quality of the variant roster high, the Diplicity
              team reviews every submission and reserves the right to decline a
              proposal for any reason. That said, we genuinely want to see great
              variants published — if something needs tweaking, we&apos;ll work
              with you to get it there. No guarantees, but we&apos;re rooting
              for you.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Becoming official</h2>
            <p>
              Players are by default guided to &ldquo;official&rdquo; variants.
              These are proven popular, well optimized, and offer good (first)
              player experiences. If your variant becomes popular, we can add it
              to the &ldquo;official&rdquo; roster — but we do this on an
              invite-only basis.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
