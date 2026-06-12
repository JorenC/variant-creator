import { forwardRef, useImperativeHandle, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NationColorPicker, DIPLOMACY_PALETTE } from "@/components/common/NationColorPicker";
import { toSlug } from "@/utils/dvarAssemble";
import { nationsSchema, type NationsValues } from "./schemas";

const DEFAULT_COLORS = DIPLOMACY_PALETTE.map(p => p.value);

export interface NationsFormHandle {
  getValues: () => NationsValues["nations"];
}

interface NationsFormProps {
  formId: string;
  defaultValues?: Partial<NationsValues>;
  onSubmit: (values: NationsValues) => void;
}

export const NationsForm = forwardRef<NationsFormHandle, NationsFormProps>(function NationsForm({ formId, defaultValues, onSubmit }, ref) {
  const form = useForm<NationsValues>({
    resolver: zodResolver(nationsSchema),
    defaultValues: {
      nations: defaultValues?.nations ?? [
        { id: "", name: "", color: DEFAULT_COLORS[0] },
      ],
    },
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;

  useImperativeHandle(ref, () => ({ getValues: () => form.getValues().nations }), [form]);

  const { fields, append, remove } = useFieldArray({ control, name: "nations" });
  const watchedNations = watch("nations");

  // Nations that arrived with an ID (pre-filled from an existing .dvar) keep it
  // even when renamed: every supply center, unit, and dominance rule in the
  // pre-filled data references that ID, so regenerating it from the new name
  // would orphan them all. Only nations created in this session auto-slug.
  const lockedIdKeys = useRef<Set<string> | null>(null);
  if (lockedIdKeys.current === null) {
    lockedIdKeys.current = new Set(
      fields
        .filter((_, i) => (defaultValues?.nations?.[i]?.id ?? "") !== "")
        .map(f => f.id)
    );
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      className="max-w-xl space-y-4"
    >
      {errors.nations?.root && (
        <p className="text-sm text-destructive">{errors.nations.root.message}</p>
      )}

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3"
          >
            <NationColorPicker
              value={watchedNations[index]?.color ?? DEFAULT_COLORS[0]}
              onChange={color =>
                setValue(`nations.${index}.color`, color, { shouldValidate: true })
              }
            />

            <div className="flex-1">
              <Input
                {...register(`nations.${index}.name`, {
                  onChange: e => {
                    if (!lockedIdKeys.current?.has(field.id)) {
                      setValue(`nations.${index}.id`, toSlug(e.target.value));
                    }
                  },
                })}
                placeholder="Nation name"
                aria-invalid={!!errors.nations?.[index]?.name}
              />
              {errors.nations?.[index]?.name && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.nations[index]?.name?.message}
                </p>
              )}
              {errors.nations?.[index]?.id && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.nations[index]?.id?.message}
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              disabled={fields.length <= 1}
              aria-label="Remove nation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() =>
          append({
            id: "",
            name: "",
            color: DEFAULT_COLORS[fields.length % DEFAULT_COLORS.length],
          })
        }
      >
        <Plus className="h-4 w-4" />
        Add Nation
      </Button>
    </form>
  );
});

NationsForm.displayName = "NationsForm";
