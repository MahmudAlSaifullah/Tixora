import { ActionForm } from "@/components/kit/action-form";
import { Field, NativeSelect } from "@/components/kit";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "@/server/actions/account";

export function ReviewForm({ eventId }: { eventId: string }) {
  return (
    <ActionForm action={submitReview.bind(null, eventId)} submitLabel="Post review" className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">You attended this event. How was it?</p>
      <Field label="Rating" htmlFor="rating" className="max-w-40">
        <NativeSelect id="rating" name="rating" defaultValue="5">
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "star" : "stars"}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Comment (optional)" htmlFor="comment">
        <Textarea id="comment" name="comment" maxLength={1000} rows={3} />
      </Field>
    </ActionForm>
  );
}
