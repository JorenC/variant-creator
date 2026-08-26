import { forwardRef, useImperativeHandle, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ANY_HOME_CENTER_MODIFIER, BUILD_ANYWHERE_MODIFIER } from "@/utils/dvarAssemble";

export interface AdjudicationModifiersFormHandle {
  submit: () => void;
  getValues: () => string[];
}

interface AdjudicationModifiersFormProps {
  defaultValues: string[];
  onSubmit: (data: string[]) => void;
}

type BuildOption = "classical" | "build-anywhere" | "any-home-center";

const BUILD_OPTION_MODIFIERS: Record<BuildOption, string | null> = {
  classical: null,
  "build-anywhere": BUILD_ANYWHERE_MODIFIER,
  "any-home-center": ANY_HOME_CENTER_MODIFIER,
};

// Build-anywhere wins when a hand-edited dVAR carries both build modifiers —
// it is a superset of any-home-center (the import warning flags the drop).
const initialBuildOption = (modifiers: string[]): BuildOption => {
  if (modifiers.includes(BUILD_ANYWHERE_MODIFIER)) return "build-anywhere";
  if (modifiers.includes(ANY_HOME_CENTER_MODIFIER)) return "any-home-center";
  return "classical";
};

export const AdjudicationModifiersForm = forwardRef<AdjudicationModifiersFormHandle, AdjudicationModifiersFormProps>(
  ({ defaultValues, onSubmit }, ref) => {
    const [buildOption, setBuildOption] = useState<BuildOption>(
      initialBuildOption(defaultValues)
    );

    // Preserve modifiers this form doesn't manage (e.g. the neutral-rebuild
    // toggle, which lives on the export step) so navigating through this step
    // never silently drops them.
    const buildModifiers = (): string[] => {
      const modifiers = defaultValues.filter(
        m => m !== BUILD_ANYWHERE_MODIFIER && m !== ANY_HOME_CENTER_MODIFIER
      );
      const modifier = BUILD_OPTION_MODIFIERS[buildOption];
      if (modifier) modifiers.push(modifier);
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
        <div className="space-y-3">
          <p className="font-medium">Build options</p>
          <RadioGroup value={buildOption} onValueChange={v => setBuildOption(v as BuildOption)}>
            <label className="flex cursor-pointer items-start gap-3">
              <RadioGroupItem value="classical" className="mt-0.5" />
              <div>
                <p className="font-medium">Own home centers only (classical)</p>
                <p className="text-sm text-muted-foreground">
                  Nations may build only in their own home supply centers.
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <RadioGroupItem value="build-anywhere" className="mt-0.5" />
              <div>
                <p className="font-medium">Build anywhere (any supply center)</p>
                <p className="text-sm text-muted-foreground">
                  Nations may build in any vacant owned supply center, not only home centers.
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <RadioGroupItem value="any-home-center" className="mt-0.5" />
              <div>
                <p className="font-medium">Any home center (precores)</p>
                <p className="text-sm text-muted-foreground">
                  Nations may build in any owned home supply center, including other players&apos; and
                  neutral home centers — but not in supply centers that started unowned.
                </p>
              </div>
            </label>
          </RadioGroup>
        </div>
      </div>
    );
  }
);

AdjudicationModifiersForm.displayName = "AdjudicationModifiersForm";
