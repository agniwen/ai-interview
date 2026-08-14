import { parseSchema, getDefaultValues } from "@autoform/core";
import type { AutoFormProps } from "@autoform/react";
import { AutoFormProvider } from "@autoform/react";
import { useEffect, useMemo, useCallback } from "react";
import type { DefaultValues, FieldValues, Path } from "react-hook-form";
import { useForm, FormProvider } from "react-hook-form";
import { CustomAutoFormField } from "./components/custom-auto-form-field";
import { removeEmptyValues } from "./utils";

export function CustomAutoForm<T extends FieldValues>({
  schema,
  onSubmit = () => {
    /* empty */
  },
  defaultValues,
  values,
  children,
  uiComponents,
  formComponents,
  withSubmit = false,
  onFormInit = () => {
    /* empty */
  },
  formProps = {},
}: AutoFormProps<T>) {
  // Memoize parsed schema to prevent re-parsing on every render
  const parsedSchema = useMemo(() => parseSchema(schema), [schema]);
  const methods = useForm<T>({
    defaultValues: {
      ...(getDefaultValues(schema) as Partial<T>),
      ...defaultValues,
    } as DefaultValues<T>,
    values: values as T,
  });

  useEffect(() => {
    if (onFormInit) {
      onFormInit(methods);
    }
  }, [onFormInit, methods]);

  const handleSubmit = useCallback(
    async (dataRaw: T) => {
      const data = removeEmptyValues(dataRaw);
      const validationResult = schema.validateSchema(data as T);
      if (validationResult.success) {
        await onSubmit(validationResult.data, methods);
      } else {
        methods.clearErrors();
        let isFocused = false;
        for (const error of validationResult.errors ?? []) {
          const path = error.path.join(".");
          methods.setError(
            path as Path<T>,
            {
              message: error.message,
              type: "custom",
            },
            { shouldFocus: !isFocused },
          );

          isFocused = true;

          // For some custom errors, zod adds the final element twice for some reason
          const correctedPath = error.path?.slice?.(0, -1);
          if (correctedPath?.length > 0) {
            methods.setError(correctedPath.join(".") as Path<T>, {
              message: error.message,
              type: "custom",
            });
          }
        }
      }
    },
    [schema, onSubmit, methods],
  );

  // Memoize the provider value to prevent unnecessary re-renders of form fields
  const providerValue = useMemo(
    () => ({
      formComponents,
      schema: parsedSchema,
      uiComponents,
    }),
    [parsedSchema, uiComponents, formComponents],
  );

  return (
    <FormProvider {...methods}>
      <AutoFormProvider value={providerValue}>
        <uiComponents.Form onSubmit={methods.handleSubmit(handleSubmit)} {...formProps}>
          {parsedSchema.fields.map((field) => (
            <CustomAutoFormField key={field.key} field={field} path={[field.key]} />
          ))}
          {children}
          {withSubmit && <uiComponents.SubmitButton>提交</uiComponents.SubmitButton>}
        </uiComponents.Form>
      </AutoFormProvider>
    </FormProvider>
  );
}
