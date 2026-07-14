import { Button } from "@mastra/playground-ui/components/Button";
import type { ButtonProps } from "@mastra/playground-ui/components/Button";
import { Label } from "@mastra/playground-ui/components/Label";
import { cn } from "@mastra/playground-ui/utils/cn";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useCallback, useMemo } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { z } from "zod3";
import { AutoForm } from "./auto-form";
import { CustomZodProvider } from "./zod-provider";
import { getShape, getIntersection } from "./zod-provider/compat";

interface DynamicFormProps {
  schema: z.ZodTypeAny;
  onSubmit?: (values: unknown) => void | Promise<void>;
  onValuesChange?: (values: unknown) => void;
  defaultValues?: unknown;
  isSubmitLoading?: boolean;
  submitButtonLabel?: string;
  submitButtonClassName?: string;
  submitButtonIcon?: ReactNode;
  submitButtonVariant?: ButtonProps["variant"];
  submitButtonFullWidth?: boolean;
  disableSubmit?: boolean;
  className?: string;
  readOnly?: boolean;
  children?: React.ReactNode;
  submitActions?: React.ReactNode;
  leftActions?: React.ReactNode;
}

function isEmptyZodObject(schema: unknown): boolean {
  const shape = getShape(schema);
  if (shape) {
    return Object.keys(shape).length === 0;
  }

  const intersection = getIntersection(schema);
  if (intersection) {
    return isEmptyZodObject(intersection.left) && isEmptyZodObject(intersection.right);
  }

  return false;
}

function isZodObjectLike(schema: unknown): boolean {
  return getShape(schema) !== undefined;
}

function unwrapFormValues(values: FieldValues, isNotZodObject: boolean) {
  if (!isNotZodObject) {
    return values;
  }
  return Object.hasOwn(values, "\u200B") ? values["\u200B"] : {};
}

function normalizeSchema(schema: z.ZodTypeAny, isNotZodObject: boolean) {
  if (isEmptyZodObject(schema)) {
    return z.object({});
  }
  if (isNotZodObject) {
    return z.object({ "\u200B": schema });
  }
  return schema;
}

export function DynamicForm({
  schema,
  onSubmit,
  onValuesChange,
  defaultValues,
  isSubmitLoading,
  submitButtonLabel,
  submitButtonClassName,
  submitButtonIcon,
  submitButtonVariant,
  submitButtonFullWidth,
  disableSubmit,
  className,
  readOnly,
  children,
  submitActions,
  leftActions,
}: DynamicFormProps) {
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const formRef = useRef<UseFormReturn<FieldValues> | null>(null);
  const isNotZodObject = !isZodObjectLike(schema);
  const onValuesChangeRef = useRef(onValuesChange);
  onValuesChangeRef.current = onValuesChange;

  useEffect(
    () => () => {
      subscriptionRef.current?.unsubscribe();
    },
    [],
  );

  const subscribeToValues = useCallback(
    (form: UseFormReturn<FieldValues>) => {
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;

      if (!onValuesChangeRef.current) {
        return;
      }

      subscriptionRef.current = form.watch((values) => {
        const normalizedValues = unwrapFormValues(values, isNotZodObject);
        onValuesChangeRef.current?.(normalizedValues);
      });
    },
    [isNotZodObject],
  );

  const shouldSubscribeToValues = Boolean(onValuesChange);

  useEffect(() => {
    if (formRef.current) {
      subscribeToValues(formRef.current);
    }
  }, [shouldSubscribeToValues, subscribeToValues]);

  const handleFormInit = useCallback(
    (form: UseFormReturn<FieldValues>) => {
      formRef.current = form;
      subscribeToValues(form);
    },
    [subscribeToValues],
  );

  const schemaProvider = useMemo(() => {
    if (!schema) {
      return null;
    }

    return new CustomZodProvider(normalizeSchema(schema, isNotZodObject));
  }, [schema, isNotZodObject]);

  const uiComponents = useMemo(
    () => ({
      SubmitButton: ({ children: buttonChildren }: { children: React.ReactNode }) =>
        onSubmit ? (
          <div
            className={cn(
              "flex items-center justify-between gap-1",
              submitButtonFullWidth && "block",
            )}
          >
            {!submitButtonFullWidth && (leftActions ?? <div />)}
            <div className={cn("flex items-center gap-1", submitButtonFullWidth && "w-full")}>
              {submitActions}
              <Button
                variant={submitButtonVariant}
                disabled={isSubmitLoading || disableSubmit}
                className={cn(
                  submitButtonFullWidth && "w-full justify-center",
                  submitButtonClassName,
                )}
              >
                {isSubmitLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <>
                    {submitButtonIcon}
                    {submitButtonLabel || buttonChildren}
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null,
    }),
    [
      onSubmit,
      isSubmitLoading,
      submitButtonLabel,
      submitButtonClassName,
      submitButtonIcon,
      submitButtonVariant,
      submitButtonFullWidth,
      submitActions,
      leftActions,
      disableSubmit,
    ],
  );

  const formComponents = useMemo(
    () => ({
      Label: ({ value }: { value: string }) => (
        <Label className="text-sm font-normal">{value}</Label>
      ),
    }),
    [],
  );

  const formPropsObj = useMemo(
    () => ({
      className,
      noValidate: true,
    }),
    [className],
  );

  const normalizedDefaultValues = useMemo(() => {
    if (!isNotZodObject) {
      return defaultValues as FieldValues | undefined;
    }
    return defaultValues === undefined ? undefined : { "\u200B": defaultValues };
  }, [isNotZodObject, defaultValues]);

  const handleSubmit = useCallback(
    async (values: FieldValues) => {
      const normalizedValues = unwrapFormValues(values, isNotZodObject);
      await onSubmit?.(normalizedValues);
    },
    [onSubmit, isNotZodObject],
  );

  if (!schemaProvider) {
    console.error("no form schema found");
    return null;
  }

  return (
    <AutoForm
      schema={schemaProvider}
      onSubmit={handleSubmit}
      onFormInit={handleFormInit}
      defaultValues={normalizedDefaultValues}
      formProps={formPropsObj}
      uiComponents={uiComponents}
      formComponents={formComponents}
      withSubmit={true}
      readOnly={readOnly}
    >
      {children}
    </AutoForm>
  );
}
