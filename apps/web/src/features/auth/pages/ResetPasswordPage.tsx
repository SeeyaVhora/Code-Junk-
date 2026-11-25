import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@code-junk/shared";
import { Button, ButtonLink, Field } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { AuthLayout } from "../components/AuthLayout";
import { PasswordInput } from "../components/PasswordInput";
import { PasswordRules } from "../components/PasswordRules";
import { FormAlert } from "../components/FormAlert";
import { useResetPassword } from "../api";
import { applyServerErrors } from "../formErrors";

const formSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match." });
type Values = z.input<typeof formSchema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const reset = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(!token || token.length < 20);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(formSchema), defaultValues: { password: "", confirm: "" } });
  const password = watch("password");

  if (linkInvalid) {
    return (
      <AuthLayout
        title="This link has expired"
        description="Reset links work once and expire after 30 minutes. Request a new one and use the latest email."
      >
        <ButtonLink to="/forgot-password" size="lg" className="w-full">
          Request a new link
        </ButtonLink>
      </AuthLayout>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await reset.mutateAsync({ token: token!, password });
      navigate("/signin?reset=1", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESET_TOKEN_INVALID") {
        setLinkInvalid(true);
        return;
      }
      setFormError(applyServerErrors(e, setError, ["password"]));
    }
  });

  return (
    <AuthLayout
      title="Choose a new password"
      description="You'll be signed out on all devices and can sign in again with the new password."
      footer={
        <Link to="/signin" className="font-medium text-ink underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <Field label="New password" error={errors.password?.message}>
          {(a) => (
            <>
              <PasswordInput {...a} {...register("password")} autoComplete="new-password" autoFocus />
              {!errors.password && <PasswordRules value={password ?? ""} />}
            </>
          )}
        </Field>
        <Field label="Confirm new password" error={errors.confirm?.message}>
          {(a) => <PasswordInput {...a} {...register("confirm")} autoComplete="new-password" />}
        </Field>
        <Button type="submit" size="lg" loading={reset.isPending}>
          {reset.isPending ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
