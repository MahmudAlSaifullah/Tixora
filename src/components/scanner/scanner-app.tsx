"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertOctagon, AlertTriangle, Ban, Camera, CameraOff, CheckCircle2, Keyboard, Loader2, ShieldX, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Field, NativeSelect, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJson, postJson } from "@/lib/client-api";
import { formatDateTime, formatTime } from "@/lib/dates";
import { cn, humanize } from "@/lib/utils";
import { useQrCamera } from "./use-qr-camera";

interface ScanEvent {
  id: string;
  title: string;
  when: string;
  place: string;
  gate: string;
}

interface ScanResult {
  result: "ACCEPTED" | "DUPLICATE" | "INVALID" | "WRONG_EVENT" | "CANCELLED" | "REFUNDED" | "NOT_ACTIVE";
  ok: boolean;
  message: string;
  ticket: { code: string; attendeeName: string; ticketType: string; bookingReference: string; status: string } | null;
  checkedInAt: string | null;
  gate: string | null;
  previousScanner: string | null;
}

interface Stats {
  issued: number;
  checkedIn: number;
  remaining: number;
  rejectedScans: number;
  attendanceRate: number;
  byType: { name: string; checkedIn: number; issued: number }[];
  byGate: { gate: string; count: number }[];
  recent: { id: string; result: string; at: string; gate: string | null; scanner: string; attendee: string | null; code: string | null }[];
}

const RESULT_STYLE = {
  ACCEPTED: { tone: "bg-emerald-600", icon: CheckCircle2, title: "ENTRY GRANTED" },
  DUPLICATE: { tone: "bg-amber-500 text-black", icon: AlertTriangle, title: "ALREADY USED" },
  INVALID: { tone: "bg-red-600", icon: ShieldX, title: "INVALID TICKET" },
  WRONG_EVENT: { tone: "bg-red-600", icon: AlertOctagon, title: "WRONG EVENT" },
  CANCELLED: { tone: "bg-red-600", icon: Ban, title: "CANCELLED" },
  REFUNDED: { tone: "bg-red-600", icon: Undo2, title: "REFUNDED" },
  NOT_ACTIVE: { tone: "bg-red-600", icon: Ban, title: "NOT ACTIVE" },
} as const;

/** Tells apart this browser's scans. Random and stored only on this device. */
function deviceIdentity() {
  const KEY = "tixora-scanner-device";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(KEY, id);
  }
  const mobile = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
  return { deviceKey: id, deviceName: `${mobile ? "Phone" : "Computer"} ${id.slice(0, 4).toUpperCase()}` };
}

function ResultCard({ result, onDismiss }: { result: ScanResult; onDismiss: () => void }) {
  const style = RESULT_STYLE[result.result];
  const Icon = style.icon;
  return (
    <div role="alert" aria-live="assertive" data-testid="scan-result" data-result={result.result} className={cn("overflow-hidden rounded-2xl text-white", style.tone)}>
      <div className="flex items-center gap-3 p-4">
        <Icon className="size-10 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-display text-xl font-bold leading-tight">{style.title}</p>
          <p className="text-sm opacity-90">{result.message}</p>
        </div>
      </div>
      {result.ticket && (
        <dl className="grid grid-cols-2 gap-3 bg-black/20 p-4 text-sm">
          <div className="col-span-2">
            <dt className="text-xs opacity-75">Attendee</dt>
            <dd className="text-lg font-semibold leading-tight">{result.ticket.attendeeName}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-75">Ticket</dt>
            <dd className="font-medium">{result.ticket.ticketType}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-75">Ticket ID</dt>
            <dd className="font-medium">{result.ticket.code}</dd>
          </div>
          {result.checkedInAt && (
            <div>
              <dt className="text-xs opacity-75">{result.ok ? "Entry time" : "First entry"}</dt>
              <dd className="font-medium">{formatDateTime(result.checkedInAt)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs opacity-75">Gate{result.previousScanner ? " / scanner" : ""}</dt>
            <dd className="font-medium">
              {result.gate ?? "Unassigned"}
              {result.previousScanner ? ` / ${result.previousScanner}` : ""}
            </dd>
          </div>
        </dl>
      )}
      <button type="button" onClick={onDismiss} className="w-full bg-black/25 py-3 text-sm font-semibold">
        Next ticket
      </button>
    </div>
  );
}

function StatsPanel({ stats }: { stats: Stats | null }) {
  if (!stats) return null;
  const percent = Math.round(stats.attendanceRate * 100);
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4" aria-label="Attendance">
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="size-4 text-brand-glow" aria-hidden /> Attendance
          </h2>
          <p className="text-sm text-muted-foreground">
            <strong className="font-display text-xl text-foreground" data-testid="checked-in-count">
              {stats.checkedIn}
            </strong>{" "}
            of {stats.issued} ({percent}%)
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Checked in">
          <div className="h-full rounded-full bg-[var(--series-1)] transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {stats.remaining} still to arrive · {stats.rejectedScans} rejected {stats.rejectedScans === 1 ? "scan" : "scans"}
        </p>
      </div>
      {stats.byType.length > 0 && (
        <ul className="space-y-1 text-sm">
          {stats.byType.map((type) => (
            <li key={type.name} className="flex justify-between gap-3">
              <span className="truncate text-muted-foreground">{type.name}</span>
              <span className="tabular-nums">
                {type.checkedIn}/{type.issued}
              </span>
            </li>
          ))}
        </ul>
      )}
      {stats.byGate.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">By gate</h3>
          <ul className="flex flex-wrap gap-2 text-xs">
            {stats.byGate.map((gate) => (
              <li key={gate.gate} className="rounded-full bg-muted px-2.5 py-1">
                {gate.gate}: {gate.count}
              </li>
            ))}
          </ul>
        </div>
      )}
      {stats.recent.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Latest scans</h3>
          <ul className="divide-y text-sm">
            {stats.recent.slice(0, 6).map((scan) => (
              <li key={scan.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{scan.attendee ?? "Unknown code"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatTime(scan.at)}
                    {scan.gate ? ` · ${scan.gate}` : ""} · {scan.scanner}
                  </span>
                </span>
                <StatusBadge status={scan.result} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ScannerApp({ events }: { events: ScanEvent[] }) {
  const [eventId, setEventId] = useState(events[0].id);
  const [gate, setGate] = useState(events[0].gate);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const lastCode = useRef<{ value: string; at: number } | null>(null);
  const inFlight = useRef(false);
  const event = events.find((e) => e.id === eventId) ?? events[0];

  const refreshStats = useCallback(async () => {
    const data = await getJson<Stats>(`/api/scanner/stats?eventId=${eventId}`).catch(() => null);
    if (data) setStats(data);
  }, [eventId]);

  useEffect(() => {
    // Polls an external system. The state update happens after the awaited response, not in this tick.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStats();
    const timer = setInterval(refreshStats, 8000);
    return () => clearInterval(timer);
  }, [refreshStats]);

  const validate = useCallback(
    async (value: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        const data = await postJson<ScanResult>("/api/scanner/validate", { eventId, value, gate, ...deviceIdentity() });
        setResult(data);
        navigator.vibrate?.(data.ok ? 120 : [120, 80, 120]);
        void refreshStats();
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [eventId, gate, refreshStats],
  );

  // A code held in view decodes many times a second. It only counts once per few seconds.
  const onDecoded = useCallback(
    (value: string) => {
      const now = Date.now();
      if (lastCode.current && lastCode.current.value === value && now - lastCode.current.at < 4000) return;
      lastCode.current = { value, at: now };
      void validate(value);
    },
    [validate],
  );

  const { videoRef, state, start, stop } = useQrCamera(onDecoded);
  const running = state === "running";

  function submitManual(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const value = manual.trim();
    if (value.length < 3) return;
    setManual("");
    void validate(value);
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="min-w-0 space-y-4">
        <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_150px]">
          <Field label="Event" htmlFor="scan-event">
            <NativeSelect
              id="scan-event"
              value={eventId}
              className="h-11"
              onChange={(e) => {
                const next = events.find((item) => item.id === e.target.value);
                setEventId(e.target.value);
                if (next?.gate) setGate(next.gate);
                setResult(null);
                setStats(null);
              }}
            >
              {events.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Gate" htmlFor="scan-gate">
            <Input id="scan-gate" value={gate} onChange={(e) => setGate(e.target.value)} placeholder="Main gate" maxLength={60} className="h-11" />
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {event.when} · {event.place}
          </p>
        </section>

        {result && <ResultCard result={result} onDismiss={() => setResult(null)} />}

        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="relative aspect-square max-h-[60vh] w-full bg-black sm:aspect-video" style={{ "--scan-size": "240px" } as React.CSSProperties}>
            <video ref={videoRef} playsInline muted className={cn("absolute inset-0 size-full object-cover", !running && "opacity-0")} />
            {running && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="relative size-60 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                  <div className="scan-line absolute inset-x-3 top-0 h-0.5 bg-brand-glow" />
                </div>
              </div>
            )}
            {!running && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                {state === "starting" ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Starting camera" />
                ) : (
                  <div>
                    <CameraOff className="mx-auto size-8 text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {state === "denied"
                        ? "Camera access was blocked. Allow it in your browser settings, or use manual entry below."
                        : state === "unavailable"
                          ? "No camera is available here. Scanning needs a device with a camera and an https address. Use manual entry below."
                          : "Start the camera to scan tickets."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="p-3">
            {running ? (
              <Button variant="secondary" className="h-12 w-full" onClick={stop}>
                <CameraOff /> Stop camera
              </Button>
            ) : (
              <Button className="h-12 w-full" onClick={start} disabled={state === "starting"}>
                <Camera /> Start camera
              </Button>
            )}
          </div>
        </section>

        <form onSubmit={submitManual} className="rounded-2xl border bg-card p-4">
          <label htmlFor="manual-code" className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Keyboard className="size-4 text-muted-foreground" aria-hidden /> Manual ticket ID lookup
          </label>
          <div className="flex gap-2">
            <Input id="manual-code" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="TXR-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="h-11 uppercase placeholder:normal-case" />
            <Button type="submit" variant="secondary" className="h-11" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : "Check"}
            </Button>
          </div>
        </form>
      </div>
      <aside className="lg:sticky lg:top-18">
        <StatsPanel stats={stats} />
        <p className="sr-only">{humanize(state)}</p>
      </aside>
    </div>
  );
}
