'use client';

import { useForm, useStore } from '@tanstack/react-form';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';

interface AuthSignInFormProps {
  callbackURL: string
}

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, '请输入邮箱')
    .email('邮箱格式不正确'),
  password: z
    .string()
    .min(1, '请输入密码'),
});

interface FieldErrorLike {
  message?: string
}

function toErrors(errors: unknown[] | undefined): FieldErrorLike[] | undefined {
  const mapped = (errors ?? []).flatMap((error) => {
    if (!error) {
      return [];
    }

    if (typeof error === 'string') {
      return [{ message: error }];
    }

    if (typeof error === 'object' && 'message' in error) {
      return [{ message: typeof error.message === 'string' ? error.message : undefined }];
    }

    return [];
  });

  return mapped.length > 0 ? mapped : undefined;
}

function hasErrors(errors: unknown[] | undefined) {
  return !!toErrors(errors)?.length;
}

export function AuthSignInForm({ callbackURL }: AuthSignInFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onSubmit: signInSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);

      const result = await authClient.signIn.email({
        email: value.email.trim(),
        password: value.password,
        callbackURL,
      });

      if (result.error) {
        setServerError(result.error.message ?? '登录失败，请检查邮箱和密码。');
        return;
      }

      router.push(callbackURL);
    },
  });
  const isSubmitting = useStore(form.store, state => state.isSubmitting);

  return (
    <form
      className='space-y-3'
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name='email'>
        {(field) => {
          const errors = toErrors(field.state.meta.errors);

          return (
            <Field data-invalid={hasErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor={field.name}>邮箱</FieldLabel>
              <FieldContent className='gap-1.5'>
                <Input
                  aria-invalid={!!errors?.length}
                  autoComplete='email'
                  disabled={isSubmitting}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  placeholder='you@example.com'
                  type='email'
                  value={field.state.value}
                />
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name='password'>
        {(field) => {
          const errors = toErrors(field.state.meta.errors);

          return (
            <Field data-invalid={hasErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor={field.name}>密码</FieldLabel>
              <FieldContent className='gap-1.5'>
                <Input
                  aria-invalid={!!errors?.length}
                  autoComplete='current-password'
                  disabled={isSubmitting}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  placeholder='输入密码'
                  type='password'
                  value={field.state.value}
                />
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      {serverError
        ? <p className='text-destructive text-sm'>{serverError}</p>
        : null}

      <Button className='w-full mt-4!' disabled={isSubmitting} type='submit'>
        {isSubmitting ? '登录中...' : '登录'}
      </Button>
    </form>
  );
}
