"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Field } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_HOME } from "@/lib/constants";
import { postJson } from "@/lib/client-api";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@/lib/validation";

function GoogleButton({ callbackUrl }: { callbackUrl: string | null }) {
  return (
    <>
      <Button type="button" variant="outline" className="w-full" onClick={() => signIn("google", { redirectTo: callbackUrl ?? "/" })}>
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.800 3.400 14.600 2.400 12 2.400 6.700 2.400 2.400 6.700 2.400 12s4.300 9.600 9.600 9.600c5.500 0 9.200-3.900 9.200-9.400 0-.6-.1-1.100-.2-1.600H12Z" />
        </svg>
        Continue with Google
      </Button>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

const LOGIN_ERRORS: Record<string, string> = {
  suspended: "This account has been suspended. Please contact support.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
};

export function LoginForm({ callbackUrl, googleEnabled, initialError }: { callbackUrl: string | null; googleEnabled: boolean; initialError?: string }) {
  const [error, setError] = useState(initialError ? (LOGIN_ERRORS[initialError] ?? "We couldn't log you in. Please try again.") : "");
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setError("");
    const result = await signIn("credentials", { ...values, redirect: false });
    if (result?.error) {
      setError(LOGIN_ERRORS[result.code ?? ""] ?? "Incorrect email or password.");
      return;
    }
    const session = await getSession();
    // A full navigation, so the server renders with the new session cookie.
    window.location.assign(callbackUrl ?? ROLE_HOME[session?.user?.role ?? "CUSTOMER"] ?? "/");
  });

  return (
    <>
      {googleEnabled && <GoogleButton callbackUrl={callbackUrl} />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
        </Field>
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-brand-glow hover:underline">
            Forgot password?
          </Link>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Log in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        New to Tixora?{" "}
        <Link href={callbackUrl ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/register"} className="text-brand-glow hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

export function RegisterForm({ callbackUrl, googleEnabled }: { callbackUrl: string | null; googleEnabled: boolean }) {
  const [error, setError] = useState("");
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setError("");
    try {
      await postJson("/api/account/register", values);
      await signIn("credentials", { email: values.email, password: values.password, redirect: false });
      window.location.assign(callbackUrl ?? "/my-tickets");
    } catch (err) {
      setError((err as Error).message);
    }
  });

  return (
    <>
      {googleEnabled && <GoogleButton callbackUrl={callbackUrl} />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" {...form.register("name")} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters, with a letter and a number." error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />} Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login"} className="text-brand-glow hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}

function Success({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="size-4 text-success" aria-hidden /> {title}
      </p>
      <div className="mt-1 text-muted-foreground">{children}</div>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const form = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setError("");
    try {
      await postJson("/api/account/forgot-password", values);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  });

  if (done) return <Success title="Check your email">If an account exists for that address, we've sent a link to reset your password. It expires in 1 hour.</Success>;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { token, password: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setError("");
    try {
      await postJson("/api/account/reset-password", values);
      router.replace("/login?reset=1");
    } catch (err) {
      setError((err as Error).message);
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter and a number." error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Save new password
      </Button>
    </form>
  );
}
