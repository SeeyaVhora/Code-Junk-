import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { signUpSchema } from "@code-junk/shared";
import { Button, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { AuthLayout } from "../components/AuthLayout";
import { PasswordInput } from "../components/PasswordInput";
import { PasswordRules } from "../components/PasswordRules";
import { FormAlert } from "../components/FormAlert";
import { useSignUp } from "../api";
import { applyServerErrors } from "../formErrors";

const formSchema = signUpSchema.omit({ timeZone: true });
type Values = z.input<typeof formSchema>;

export default function SignUpPage() {
  const navigate = useNavigate();
  const signUp = useSignUp();
  const [formError, setFormError] = useState<React.ReactNode>(null);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<Values, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const password = watch("password");

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp.mutateAsync({ ...values, timeZone });
      navigate("/app", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === "EMAIL_TAKEN") {
        setFormError(
          <>
            An account with this email already exists.{" "}
            <Link to="/signin" className="font-medium underline underline-offset-4">
              Sign in instead
            </Link>
          </>,
        );
        return;
      }
      setFormError(applyServerErrors(e, setError, ["name", "email", "password"]));
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      description="Start your coding journal. It takes a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/signin" className="font-medium text-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <FormAlert>{formError}</FormAlert>}

        <Field label="Name" error={errors.name?.message}>
          {(a) => <Input {...a} {...register("name")} autoComplete="name" autoFocus />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(a) => <Input {...a} {...register("email")} type="email" autoComplete="email" />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(a) => (
            <>
              <PasswordInput {...a} {...register("password")} autoComplete="new-password" />
              {!errors.password && <PasswordRules value={password ?? ""} />}
            </>
          )}
        </Field>
        <p className="text-xs text-muted">
          Time zone: <span className="font-mono text-ink-2">{timeZone}</span>. Used for your daily plan, streaks and
          reminders. You can change it later in settings.
        </p>
        <Button type="submit" size="lg" loading={signUp.isPending} className="mt-1">
          {signUp.isPending ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted">
          By creating an account you agree to the{" "}
          <Link to="/terms" className="underline underline-offset-4">Terms</Link> and{" "}
          <Link to="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
