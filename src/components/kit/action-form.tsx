"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { ActionState } from "@/server/action-helpers";

type ServerAction = (state: ActionState, form: FormData) => Promise<ActionState>;
type ButtonProps = React.ComponentProps<typeof Button>;

const initial: ActionState = { ok: false };

function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

/**
 * Toasts fire as soon as the action returns, not from an effect: revalidation often removes the
 * row that holds this button, and an unmounted component would never run its effect.
 */
function withToasts(action: ServerAction): ServerAction {
  return async (state, form) => {
    const result = await action(state, form);
    if (result.ok && result.message) toast.success(result.message);
    else if (!result.ok && result.error) toast.error(result.error);
    return result;
  };
}

function useOnSuccess(state: ActionState, onSuccess: () => void) {
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.ok) onSuccess();
  }, [state, onSuccess]);
}

/** A form wired to a server action, with pending state, toasts and inline errors. */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitProps,
  resetOnSuccess,
  className,
}: {
  action: ServerAction;
  children?: React.ReactNode;
  submitLabel: string;
  submitProps?: ButtonProps;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const [state, formAction] = useActionState(withToasts(action), initial);
  const formRef = useRef<HTMLFormElement>(null);
  useOnSuccess(state, () => {
    if (resetOnSuccess) formRef.current?.reset();
  });
  return (
    <form ref={formRef} action={formAction} className={className ?? "space-y-4"}>
      {children}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <SubmitButton {...submitProps}>{submitLabel}</SubmitButton>
    </form>
  );
}

/**
 * One-click action for table rows. With `confirm`, asks first. With `reasonLabel`, also collects a
 * required reason, which the server action receives as the "reason" form field.
 */
export function ActionButton({
  action,
  label,
  confirm,
  confirmLabel,
  reasonLabel,
  amountLabel,
  variant = "outline",
  size = "sm",
}: {
  action: ServerAction;
  label: string;
  confirm?: string;
  confirmLabel?: string;
  reasonLabel?: string;
  /** Adds an optional numeric "amount" field to the dialog. */
  amountLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [state, formAction] = useActionState(withToasts(action), initial);
  const [open, setOpen] = useState(false);
  useOnSuccess(state, () => setOpen(false));

  if (!confirm && !reasonLabel) {
    return (
      <form action={formAction} className="inline-block">
        <SubmitButton variant={variant} size={size}>
          {label}
        </SubmitButton>
      </form>
    );
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{confirm ?? "Please confirm this action."}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={formAction} className="space-y-4">
          {amountLabel && (
            <div className="space-y-2">
              <Label htmlFor="action-amount">{amountLabel}</Label>
              <Input id="action-amount" name="amount" type="number" min={0} step="0.01" />
            </div>
          )}
          {reasonLabel && (
            <div className="space-y-2">
              <Label htmlFor="action-reason">{reasonLabel}</Label>
              <Textarea id="action-reason" name="reason" required minLength={3} maxLength={500} rows={3} />
            </div>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <SubmitButton variant={variant === "destructive" ? "destructive" : "default"}>{confirmLabel ?? label}</SubmitButton>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
