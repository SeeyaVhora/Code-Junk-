import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { signInSchema } from "@code-junk/shared";
import { Button, Field, Input } from "@/components/ui";
import { AuthLayout } from "../components/AuthLayout";
import { PasswordInput } from "../components/PasswordInput";
import { FormAlert } from "../components/FormAlert";
import { safeNext, useSignIn } from "../api";
import { applyServerErrors } from "../formErrors";

type Values = z.input<typeof signInSchema>;

export default function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const signIn = useSignIn();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values, unknown, z.output<typeof signInSchema>>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn.mutateAsync(values);
      navigate(safeNext(params.get("next")), { replace: true });
    } catch (e) {
      setFormError(applyServerErrors(e, setError, ["email", "password"]));
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to pick up where you left off."
      footer={
        <>
          New to Code Junk?{" "}
          <Link to="/signup" className="font-medium text-ink underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {params.get("reset") === "1" && !formError && (
          <FormAlert tone="success">Your password was changed. Sign in with your new password.</FormAlert>
        )}
        {formError && <FormAlert>{formError}</FormAlert>}

        <Field label="Email" error={errors.email?.message}>
          {(a) => <Input {...a} {...register("email")} type="email" autoComplete="email" autoFocus />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(a) => <PasswordInput {...a} {...register("password")} autoComplete="current-password" />}
        </Field>
        <div className="-mt-1 text-right">
          <Link to="/forgot-password" className="text-[13px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" loading={signIn.isPending} className="mt-1">
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
