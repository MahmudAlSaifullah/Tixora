"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadImage } from "@/lib/client-api";
import { Cover } from "@/components/events/cover";

function usePicker(onFiles: (files: File[]) => Promise<void>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      await onFiles(files);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { inputRef, busy, onChange };
}

export function ImageUpload({ value, onChange, label, aspect = "aspect-[16/9]" }: { value: string | null | undefined; onChange: (url: string | null) => void; label: string; aspect?: string }) {
  const { inputRef, busy, onChange: pick } = usePicker(async ([file]) => onChange(await uploadImage(file)));
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} aria-label={label} data-testid={`upload-${label}`} />
      {value ? (
        <div className={`relative ${aspect} overflow-hidden rounded-xl border`}>
          <Cover src={value} alt="" sizes="480px" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Replace
            </Button>
            <Button type="button" size="icon" variant="secondary" className="size-8" onClick={() => onChange(null)} aria-label={`Remove ${label}`}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={`flex ${aspect} w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground`}>
          {busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <ImagePlus className="size-6" aria-hidden />}
          Upload {label.toLowerCase()}
          <span className="text-xs">JPEG, PNG or WebP, up to 5 MB</span>
        </button>
      )}
    </div>
  );
}

export function GalleryUpload({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const { inputRef, busy, onChange: pick } = usePicker(async (files) => {
    const urls = await Promise.all(files.slice(0, 12 - value.length).map(uploadImage));
    onChange([...value, ...urls]);
  });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {value.map((url) => (
        <div key={url} className="relative aspect-[4/3] overflow-hidden rounded-lg border">
          <Cover src={url} alt="" sizes="200px" />
          <Button type="button" size="icon" variant="secondary" className="absolute right-1.5 top-1.5 size-7" onClick={() => onChange(value.filter((v) => v !== url))} aria-label="Remove image">
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      {value.length < 12 && (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:border-white/25 hover:text-foreground">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
          Add image
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={pick} aria-label="Gallery images" />
    </div>
  );
}
