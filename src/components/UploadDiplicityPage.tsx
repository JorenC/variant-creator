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
            <p className="text-sm text-muted-foreground">
              Private games on custom maps are on our roadmap, but not available
              yet. For now, the Sandbox is the best way to playtest your
              variant.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Getting your variant published</h2>
            <p>
              If your variant is working well and you&apos;d like it to become
              part of the official Diplicity roster — playable by everyone — you
              can apply to have it published. Reach out to the Diplicity team
              on{" "}
              <a
                href="https://discord.gg/TPxS67fw9T"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Discord
              </a>{" "}
              and we&apos;ll be happy to take a look.
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
        </div>
      </div>
    </>
  );
}
