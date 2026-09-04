"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icons";
import type { FormState } from "@/app/actions/auth";

export function SubmitButton({
  children,
  className = "btn",
  pendingLabel,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="notice error" role="alert">
      <Icon name="alert" />
      <span>{message}</span>
    </div>
  );
}

/** Wraps a server action so the page can render its error inline. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className={className ?? "stack"}>
      <FormError message={state.error} />
      {children}
    </form>
  );
}
