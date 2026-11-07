import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "./errors";

export interface ActionState {
  ok: boolean;
  message?: string;
  error?: string;
}

export const initialActionState: ActionState = { ok: false };

/** Runs a server action body and turns failures into a state the form can show. */
export async function act(body: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await body();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    unstable_rethrow(error); // let redirect() and notFound() do their work
    if (error instanceof AppError) return { ok: false, error: error.message };
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? "Please check your input." };
    console.error("[action] unhandled error", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export const formValues = (form: FormData) => {
  const values: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string" && value !== "") values[key] = value;
  });
  return values;
};
