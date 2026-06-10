import { forwardRef, useImperativeHandle, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toSlug } from "@/utils/dvarAssemble";
import { basicInfoSchema, type BasicInfoValues } from "./schemas";

export interface BasicInfoFormHandle {
  getValues: () => BasicInfoValues;
}

interface BasicInfoFormProps {
  formId: string;
  defaultValues?: Partial<BasicInfoValues>;
  onSubmit: (values: BasicInfoValues) => void;
}

export const BasicInfoForm = forwardRef<BasicInfoFormHandle, BasicInfoFormProps>(function BasicInfoForm({ formId, defaultValues, onSubmit }, ref) {
  const idEdited = useRef(false);

  const form = useForm<BasicInfoValues>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      name: "",
      id: "",
      description: "",
      author: "",
      startYear: 1901,
      rules: "",
      ...defaultValues,
    },
  });

  const { register, handleSubmit, setValue, formState: { errors } } = form;

  useImperativeHandle(ref, () => ({ getValues: () => form.getValues() }), [form]);

  const { onChange: rhfNameOnChange, ...nameRegisterRest } = register("name");
  const { onChange: rhfIdOnChange, ...idRegisterRest } = register("id");

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      className="max-w-xl space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor={`${formId}-name`}>Name *</Label>
        <Input
          id={`${formId}-name`}
          {...nameRegisterRest}
          onChange={e => {
            rhfNameOnChange(e);
            if (!idEdited.current) {
              setValue("id", toSlug(e.target.value), { shouldValidate: true });
            }
          }}
          placeholder="e.g., Classical Europe"
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-id`}>ID *</Label>
        <Input
          id={`${formId}-id`}
          {...idRegisterRest}
          onChange={e => {
            idEdited.current = true;
            rhfIdOnChange(e);
          }}
          placeholder="e.g., classical-europe"
          aria-invalid={!!errors.id}
        />
        <p className="text-xs text-muted-foreground">
          Auto-generated from name. Lowercase letters, numbers, and hyphens only.
        </p>
        {errors.id && (
          <p className="text-sm text-destructive">{errors.id.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-description`}>Description *</Label>
        <Textarea
          id={`${formId}-description`}
          {...register("description")}
          placeholder="One or two sentences describing the variant."
          rows={2}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-author`}>Author *</Label>
        <Input
          id={`${formId}-author`}
          {...register("author")}
          placeholder="e.g., Allan B. Calhamer"
          aria-invalid={!!errors.author}
        />
        {errors.author && (
          <p className="text-sm text-destructive">{errors.author.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-startYear`}>Start year *</Label>
        <Input
          id={`${formId}-startYear`}
          type="number"
          className="w-36"
          {...register("startYear", { valueAsNumber: true })}
          aria-invalid={!!errors.startYear}
        />
        {errors.startYear && (
          <p className="text-sm text-destructive">{errors.startYear.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-rules`}>
          Rules{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={`${formId}-rules`}
          {...register("rules")}
          placeholder="Long-form, player-facing rules text."
          rows={4}
        />
      </div>
    </form>
  );
});

BasicInfoForm.displayName = "BasicInfoForm";
