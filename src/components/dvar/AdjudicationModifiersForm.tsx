import { forwardRef, useImperativeHandle, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { BUILD_ANYWHERE_MODIFIER } from "@/utils/dvarAssemble";

export interface AdjudicationModifiersFormHandle {
  submit: () => void;
  getValues: () => string[];
}

interface AdjudicationModifiersFormProps {
  defaultValues: string[];
  onSubmit: (data: string[]) => void;
}

export const AdjudicationModifiersForm = forwardRef<AdjudicationModifiersFormHandle, AdjudicationModifiersFormProps>(
  ({ defaultValues, onSubmit }, ref) => {
    const [buildAnywhere, setBuildAnywhere] = useState(
      defaultValues.includes(BUILD_ANYWHERE_MODIFIER)
    );

    // Preserve modifiers this form doesn't manage (e.g. the neutral-rebuild
    // toggle, which lives on the export step) so navigating through this step
    // never silently drops them.
    const buildModifiers = (): string[] => {
      const modifiers = defaultValues.filter(m => m !== BUILD_ANYWHERE_MODIFIER);
      if (buildAnywhere) modifiers.push(BUILD_ANYWHERE_MODIFIER);
      return modifiers;
    };

    useImperativeHandle(ref, () => ({
      submit: () => onSubmit(buildModifiers()),
      getValues: buildModifiers,
    }));

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Game Rules</h2>
          <p className="text-sm text-muted-foreground">Configure adjudicator rule modifiers for this variant.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={buildAnywhere}
            onCheckedChange={checked => setBuildAnywhere(checked === true)}
            className="mt-0.5"
          />
          <div>
            <p className="font-medium">Build anywhere</p>
            <p className="text-sm text-muted-foreground">
              Nations may build in any vacant owned supply center, not only home centers.
            </p>
          </div>
        </label>
      </div>
    );
  }
);

AdjudicationModifiersForm.displayName = "AdjudicationModifiersForm";
