import { forwardRef, useImperativeHandle, useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PhaseEntry, PhaseProgressionData, PhaseType } from "@/types/dvar";

export interface PhaseProgressionFormHandle {
  getValues: () => PhaseProgressionData;
  submit: () => void;
}

interface PhaseProgressionFormProps {
  defaultValues: PhaseProgressionData;
  onSubmit: (data: PhaseProgressionData) => void;
}

interface PhaseRow extends PhaseEntry {
  key: string;
}

let nextRowKey = 0;
const makeRowKey = () => `phase-row-${nextRowKey++}`;

export const PhaseProgressionForm = forwardRef<PhaseProgressionFormHandle, PhaseProgressionFormProps>(
  ({ defaultValues, onSubmit }, ref) => {
    const [entries, setEntries] = useState<PhaseRow[]>(
      () => defaultValues.map(e => ({ ...e, key: makeRowKey() }))
    );
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const toData = (rows: PhaseRow[]): PhaseProgressionData =>
      rows.map(({ season, type, yearDelta }) => ({ season, type, yearDelta }));

    useImperativeHandle(ref, () => ({
      getValues: () => toData(entries),
      submit: () => {
        const seen = new Set<string>();
        for (const entry of entries) {
          if (entry.season.trim() === "") {
            setError("Every phase needs a season name.");
            return;
          }
          const key = `${entry.season}/${entry.type}`;
          if (seen.has(key)) {
            setError(`Duplicate phase: "${entry.season} / ${entry.type}" appears more than once. Each season and type combination must be unique.`);
            return;
          }
          seen.add(key);
        }
        setError(null);
        onSubmit(toData(entries));
      },
    }));

    const updateEntry = <K extends keyof PhaseEntry>(index: number, key: K, value: PhaseEntry[K]) => {
      setError(null);
      setEntries(prev => prev.map((e, i) => (i === index ? { ...e, [key]: value } : e)));
    };

    const removeEntry = (index: number) => {
      setError(null);
      setEntries(prev => prev.filter((_, i) => i !== index));
    };

    const addEntry = () => {
      setError(null);
      setEntries(prev => [...prev, { key: makeRowKey(), season: "Spring", type: "Movement", yearDelta: 0 }]);
    };

    const handleDragStart = (index: number) => setDragIndex(index);

    const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
    };

    const handleDrop = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      setEntries(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(index, 0, moved);
        return next;
      });
      setDragIndex(null);
      setDragOverIndex(null);
    };

    const handleDragEnd = () => {
      setDragIndex(null);
      setDragOverIndex(null);
    };

    return (
      <div className="space-y-3 max-w-xl">
        <div className="space-y-1">
          {entries.map((entry, index) => (
            <div
              key={entry.key}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                dragOverIndex === index && dragIndex !== index
                  ? "border-primary bg-primary/5"
                  : "bg-muted/20",
                dragIndex === index && "opacity-40"
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />

              <Input
                value={entry.season}
                onChange={e => updateEntry(index, "season", e.target.value)}
                placeholder="Season"
                className="h-7 w-28 text-sm"
              />

              <Select
                value={entry.type}
                onValueChange={val => updateEntry(index, "type", val as PhaseType)}
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Movement">Movement</SelectItem>
                  <SelectItem value="Retreat">Retreat</SelectItem>
                  <SelectItem value="Adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">year +</span>
                <Input
                  type="number"
                  min={0}
                  value={entry.yearDelta}
                  onChange={e => updateEntry(index, "yearDelta", Math.max(0, parseInt(e.target.value) || 0))}
                  className="h-7 w-14 text-sm"
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7 shrink-0"
                onClick={() => removeEntry(index)}
                disabled={entries.length <= 1}
                aria-label="Remove phase"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4" />
          Add Phase
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);

PhaseProgressionForm.displayName = "PhaseProgressionForm";
