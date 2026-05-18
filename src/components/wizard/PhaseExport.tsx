import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useVariant } from "@/hooks/useVariant";
import { downloadSchemaJson } from "@/utils/schemaExport";

export function PhaseExport() {
  const { variant } = useVariant();

  if (!variant) return null;

  const totalProvinces = variant.provinces.length;
  const supplyCenters = variant.provinces.filter((p) => p.supplyCenter).length;
  const landProvinces = variant.provinces.filter((p) => p.type === "land" || p.type === "namedCoasts").length;
  const seaProvinces = variant.provinces.filter((p) => p.type === "sea").length;
  const coastalProvinces = variant.provinces.filter((p) => p.type === "coastal").length;

  const warnings: string[] = [];
  if (!variant.name.trim()) warnings.push("Variant name is missing.");
  if (variant.nations.length < 2) warnings.push("At least 2 nations are required.");
  if (totalProvinces === 0) warnings.push("No provinces have been defined.");
  const provincesWithoutAdjacencies = variant.provinces.filter(
    (p) => p.adjacencies.length === 0
  ).length;
  if (provincesWithoutAdjacencies > 0) {
    warnings.push(`${provincesWithoutAdjacencies} province(s) have no adjacencies.`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Variant Summary</CardTitle>
          <CardDescription>Review your variant before exporting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{variant.name || <span className="text-destructive">—</span>}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Author</p>
              <p className="font-medium">{variant.author || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Start Year</p>
              <p className="font-medium">{variant.startYear}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Solo Victory SCs</p>
              <p className="font-medium">{variant.soloVictorySCCount}</p>
            </div>
          </div>
          {variant.description && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="text-sm">{variant.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {variant.nations.map((nation) => (
              <div
                key={nation.id}
                className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
              >
                <span
                  className="h-3 w-3 rounded-full border"
                  style={{ backgroundColor: nation.color }}
                />
                {nation.name}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provinces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-3 text-center">
              <p className="text-2xl font-semibold">{totalProvinces}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-center">
              <p className="text-2xl font-semibold">{supplyCenters}</p>
              <p className="text-xs text-muted-foreground">Supply Centers</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-center">
              <p className="text-2xl font-semibold">{landProvinces}</p>
              <p className="text-xs text-muted-foreground">Land</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-center">
              <p className="text-2xl font-semibold">{seaProvinces + coastalProvinces}</p>
              <p className="text-xs text-muted-foreground">Sea / Coastal</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {warnings.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Warnings</CardTitle>
            <CardDescription>
              These issues may affect the exported variant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {warnings.map((w) => (
                <li key={w} className="text-sm text-destructive">
                  {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Button
        size="lg"
        className="w-full"
        onClick={() => downloadSchemaJson(variant)}
      >
        <Download className="mr-2 h-4 w-4" />
        Download Variant JSON
      </Button>
    </div>
  );
}
