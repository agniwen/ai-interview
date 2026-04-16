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

interface AuthSignUpFormProps {
  callbackURL: string
}

const ALLOWED_PUNCTUATION = /^[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]+$/;
const ALPHANUMERIC = /^[a-z0-9]+$/i;

const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请输入昵称')
    .max(50, '昵称不能超过 50 个字符'),
  email: z
    .string()
    .trim()
    .min(1, '请输入邮箱')
    .email('邮箱格式不正确'),
  password: z
    .string()
    .min(8, '密码长度至少为 8 位')
    .max(64, '密码不能超过 64 位')
    .refine(value => !value.includes(' '), '密码不能包含空格')
    .refine((value) => {
      return [...value].every(char => ALPHANUMERIC.test(char) || ALLOWED_PUNCTUATION.test(char));
    }, '密码只能包含字母、数字和常规标点符号'),
  confirmPassword: z.string().min(1, '请再次输入密码'),
}).refine(data => data.password === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
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

export function AuthSignUpForm({ callbackURL }: AuthSignUpFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validators: {
      onSubmit: signUpSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);

      const result = await authClient.signUp.email({
        name: value.name.trim(),
        email: value.email.trim(),
        password: value.password,
        callbackURL,
      });

      if (result.error) {
        setServerError(result.error.message ?? '注册失败，请稍后重试。');
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
      <form.Field name='name'>
        {(field) => {
          const errors = toErrors(field.state.meta.errors);

          return (
            <Field data-invalid={hasErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor={field.name}>昵称</FieldLabel>
              <FieldContent className='gap-1.5'>
                <Input
                  aria-invalid={!!errors?.length}
                  autoComplete='name'
                  disabled={isSubmitting}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  placeholder='输入你的昵称'
                  type='text'
                  value={field.state.value}
                />
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

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
                  autoComplete='new-password'
                  disabled={isSubmitting}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  placeholder='至少 8 位，不含空格'
                  type='password'
                  value={field.state.value}
                />
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name='confirmPassword'>
        {(field) => {
          const errors = toErrors(field.state.meta.errors);

          return (
            <Field data-invalid={hasErrors(field.state.meta.errors) || undefined}>
              <FieldLabel htmlFor={field.name}>确认密码</FieldLabel>
              <FieldContent className='gap-1.5'>
                <Input
                  aria-invalid={!!errors?.length}
                  autoComplete='new-password'
                  disabled={isSubmitting}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  placeholder='再次输入密码'
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

      <Button className='w-full mt-4' disabled={isSubmitting} type='submit'>
        {isSubmitting ? '注册中...' : '注册'}
      </Button>
    </form>
  );
}
