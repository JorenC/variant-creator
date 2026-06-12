import { forwardRef, useImperativeHandle, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VictoryCondition, VictoryConditionsData, VictoryConditionType } from "@/types/dvar";

export interface VictoryConditionsFormHandle {
  submit: () => void;
  getValues: () => VictoryConditionsData;
}

interface VictoryConditionsFormProps {
  provinces: Array<{ id: string; name: string }>;
  defaultValues: VictoryConditionsData;
  onSubmit: (data: VictoryConditionsData) => void;
}

export const VictoryConditionsForm = forwardRef<VictoryConditionsFormHandle, VictoryConditionsFormProps>(
  ({ provinces, defaultValues, onSubmit }, ref) => {
    const [conditions, setConditions] = useState<VictoryConditionsData>(defaultValues);
    const [errorIndices, setErrorIndices] = useState<Set<number>>(new Set());

    useImperativeHandle(ref, () => ({
      submit: () => {
        const invalid = new Set<number>();
        conditions.forEach((c, i) => {
          if (c.type === "province-control" && c.provinces.length === 0) invalid.add(i);
        });
        if (invalid.size > 0) {
          setErrorIndices(invalid);
          return;
        }
        setErrorIndices(new Set());
        onSubmit(conditions);
      },
      getValues: () => conditions,
    }));

    const addCondition = () => {
      setConditions(prev => [...prev, { type: "supply-center-majority", supplyCenters: 18 }]);
    };

    const removeCondition = (index: number) => {
      setConditions(prev => prev.filter((_, i) => i !== index));
    };

    const setConditionType = (index: number, type: VictoryConditionType) => {
      setConditions(prev =>
        prev.map((c, i) => {
          if (i !== index) return c;
          if (type === "supply-center-majority") return { type, supplyCenters: 18 };
          if (type === "timed-resolution") return { type, year: 1900, resolution: "most-supply-centers" as const };
          return { type: "province-control", provinces: [] };
        })
      );
    };

    const updateCondition = (index: number, updates: object) => {
      setErrorIndices(new Set());
      setConditions(prev =>
        prev.map((c, i) => (i === index ? { ...c, ...updates } as VictoryCondition : c))
      );
    };

    const LABELS: Record<VictoryConditionType, string> = {
      "supply-center-majority": "Supply center majority",
      "timed-resolution": "Timed resolution",
      "province-control": "Province control",
    };

    return (
      <div className="max-w-xl space-y-3">
        {conditions.map((condition, index) => (
          <div key={index} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Select
                value={condition.type}
                onValueChange={val => setConditionType(index, val as VictoryConditionType)}
              >
                <SelectTrigger size="sm" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABELS) as VictoryConditionType[]).map(t => (
                    <SelectItem key={t} value={t}>{LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => removeCondition(index)}
                disabled={conditions.length <= 1}
                aria-label="Remove condition"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {condition.type === "supply-center-majority" && (
              <div className="flex items-center gap-3">
                <Label className="text-sm shrink-0">Supply centers to win</Label>
                <Input
                  type="number"
                  min={1}
                  value={condition.supplyCenters}
                  onChange={e =>
                    updateCondition(index, { supplyCenters: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  className="h-7 w-20 text-sm"
                />
              </div>
            )}

            {condition.type === "timed-resolution" && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Label className="text-sm shrink-0 w-20">End year</Label>
                  <Input
                    type="number"
                    value={condition.year}
                    onChange={e =>
                      updateCondition(index, { year: parseInt(e.target.value) || 1900 })
                    }
                    className="h-7 w-28 text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm shrink-0 w-20">Resolution</Label>
                  <Select
                    value={condition.resolution}
                    onValueChange={val =>
                      updateCondition(index, { resolution: val as "most-supply-centers" | "shared-draw" })
                    }
                  >
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="most-supply-centers">Most supply centers wins</SelectItem>
                      <SelectItem value="shared-draw">Shared draw</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {condition.type === "province-control" && (
              <div className="space-y-2">
                <Label className="text-sm">Provinces to control</Label>
                {errorIndices.has(index) && (
                  <p className="text-sm text-destructive">Select at least one province for this condition.</p>
                )}
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {provinces.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No provinces defined.</p>
                  ) : (
                    [...provinces].sort((a, b) => a.id.localeCompare(b.id)).map(p => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
                        <Checkbox
                          checked={condition.provinces.includes(p.id)}
                          onCheckedChange={checked => {
                            const next = checked
                              ? [...condition.provinces, p.id]
                              : condition.provinces.filter(id => id !== p.id);
                            updateCondition(index, { provinces: next });
                          }}
                        />
                        <span className="text-sm">{p.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm shrink-0">From year</Label>
                  <Input
                    type="number"
                    value={condition.year ?? ""}
                    placeholder="Any year"
                    onChange={e => {
                      const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                      updateCondition(index, { year: val });
                    }}
                    className="h-7 w-28 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">optional</span>
                </div>
              </div>
            )}
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addCondition}>
          <Plus className="h-4 w-4" />
          Add Condition
        </Button>
      </div>
    );
  }
);

VictoryConditionsForm.displayName = "VictoryConditionsForm";
