import { AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReconcileMap, ReconcileMismatches } from "@/types/dvar";

interface ReconcileStepProps {
  mismatches: ReconcileMismatches;
  provinceMap: ReconcileMap;
  coastMap: ReconcileMap;
  onProvinceMapChange: (map: ReconcileMap) => void;
  onCoastMapChange: (map: ReconcileMap) => void;
}

export function ReconcileStep({
  mismatches,
  provinceMap,
  coastMap,
  onProvinceMapChange,
  onCoastMapChange,
}: ReconcileStepProps) {
  const claimedProvince = new Set(
    Object.values(provinceMap).filter((v): v is string => v !== null)
  );
  const claimedCoast = new Set(
    Object.values(coastMap).filter((v): v is string => v !== null)
  );

  const unclaimedProvinces = mismatches.newProvinces.filter(id => !claimedProvince.has(id));
  const unclaimedCoasts = mismatches.newCoasts.filter(id => !claimedCoast.has(id));

  const setProvinceMapping = (oldId: string, newId: string | null) =>
    onProvinceMapChange({ ...provinceMap, [oldId]: newId });
  const setCoastMapping = (oldId: string, newId: string | null) =>
    onCoastMapChange({ ...coastMap, [oldId]: newId });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-medium text-amber-900 dark:text-amber-200">ID mismatches detected</p>
          <p className="text-amber-800 dark:text-amber-300">
            Some province or coast IDs in your dVAR do not exist in the uploaded dSVG. Map each
            old ID to its replacement, or leave it as "Drop" to discard its dVAR data.
          </p>
        </div>
      </div>

      {mismatches.missingProvinces.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Provinces</p>
          <div className="space-y-2">
            {mismatches.missingProvinces.map(oldId => {
              const current = provinceMap[oldId];
              const available = mismatches.newProvinces.filter(
                id => !claimedProvince.has(id) || id === current
              );
              return (
                <div key={oldId} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {oldId}
                  </span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <Select
                    value={current ?? "__drop__"}
                    onValueChange={val => setProvinceMapping(oldId, val === "__drop__" ? null : val)}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__drop__">
                        <span className="italic text-muted-foreground">Drop (discard data)</span>
                      </SelectItem>
                      {available.map(newId => (
                        <SelectItem key={newId} value={newId}>{newId}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mismatches.missingCoasts.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Named Coasts</p>
          <div className="space-y-2">
            {mismatches.missingCoasts.map(oldId => {
              const current = coastMap[oldId];
              const available = mismatches.newCoasts.filter(
                id => !claimedCoast.has(id) || id === current
              );
              return (
                <div key={oldId} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {oldId}
                  </span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <Select
                    value={current ?? "__drop__"}
                    onValueChange={val => setCoastMapping(oldId, val === "__drop__" ? null : val)}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__drop__">
                        <span className="italic text-muted-foreground">Drop (discard data)</span>
                      </SelectItem>
                      {available.map(newId => (
                        <SelectItem key={newId} value={newId}>{newId}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(unclaimedProvinces.length > 0 || unclaimedCoasts.length > 0) && (
        <div className="space-y-2 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-sm font-medium">New in dSVG — will be added as blanks</p>
          <p className="text-xs text-muted-foreground">
            These IDs exist in the dSVG but aren't mapped to any dVAR entry. They'll be added
            with empty data for you to fill in during the Provinces step.
          </p>
          {unclaimedProvinces.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unclaimedProvinces.map(id => (
                <span key={id} className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs">
                  {id}
                </span>
              ))}
            </div>
          )}
          {unclaimedCoasts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unclaimedCoasts.map(id => (
                <span key={id} className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
