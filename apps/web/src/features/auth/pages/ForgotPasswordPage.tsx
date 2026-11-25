import { useState } from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { MailCheck } from "lucide-react";
import { forgotPasswordSchema } from "@code-junk/shared";
import { Button, ButtonLink, Field, Input } from "@/components/ui";
import { AuthLayout } from "../components/AuthLayout";
import { FormAlert } from "../components/FormAlert";
import { useForgotPassword } from "../api";
import { applyServerErrors } from "../formErrors";

type Values = z.input<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values, unknown, z.output<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await forgot.mutateAsync(values);
      setSentTo(values.email);
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ["email"]));
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <div className="flex flex-col items-start gap-4">
          <div className="flex size-11 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <MailCheck className="size-5" aria-hidden />
          </div>
          <p className="text-sm leading-relaxed text-ink-2" role="status">
            If an account exists for <span className="font-medium text-ink">{sentTo}</span>, we've sent a link to reset
            the password. It expires in 30 minutes.
          </p>
          <p className="text-sm text-muted">Nothing arrived? Check your spam folder, or try again in a minute.</p>
          <div className="mt-2 flex gap-2">
            <ButtonLink to="/signin" variant="secondary">
              Back to sign in
            </ButtonLink>
            <Button variant="ghost" onClick={() => setSentTo(null)}>
              Use another email
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a reset link."
      footer={
        <Link to="/signin" className="font-medium text-ink underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <Field label="Email" error={errors.email?.message}>
          {(a) => <Input {...a} {...register("email")} type="email" autoComplete="email" autoFocus />}
        </Field>
        <Button type="submit" size="lg" loading={forgot.isPending}>
          {forgot.isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthLayout>
  );
}
