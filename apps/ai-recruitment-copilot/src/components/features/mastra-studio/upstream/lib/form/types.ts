import type { ExtendableAutoFormProps } from "@autoform/react";
import type { FieldValues } from "react-hook-form";

export type AutoFormProps<T extends FieldValues> = ExtendableAutoFormProps<T>;
