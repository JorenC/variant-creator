import { forwardRef, useImperativeHandle, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

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
      defaultValues.includes("allow-builds-in-non-home-centers")
    );

    useImperativeHandle(ref, () => ({
      submit: () => {
        const modifiers: string[] = [];
        if (buildAnywhere) modifiers.push("allow-builds-in-non-home-centers");
        onSubmit(modifiers);
      },
      getValues: () => {
        const modifiers: string[] = [];
        if (buildAnywhere) modifiers.push("allow-builds-in-non-home-centers");
        return modifiers;
      },
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
