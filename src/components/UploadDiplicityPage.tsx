import { AppHeader } from "@/components/common/AppHeader";

export function UploadDiplicityPage() {
  return (
    <>
      <AppHeader />
      <div className="flex min-h-screen flex-col items-center p-8">
        <div className="flex w-full max-w-3xl flex-col gap-6">
          <div>
            <h1 className="text-3xl font-bold">Upload to Diplicity</h1>
            <p className="mt-1 text-muted-foreground">
              Submit your <span className="font-mono text-sm">.d.svg</span> and{" "}
              <span className="font-mono text-sm">.dvar</span> files to the Diplicity platform.
            </p>
          </div>

          <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">
            Upload functionality coming soon.
          </p>
        </div>
      </div>
    </>
  );
}
