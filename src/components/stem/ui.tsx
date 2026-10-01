import * as Slider from "@radix-ui/react-slider";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { mixEngine } from "@/lib/stem/engine";

export function Button({
  variant = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "quiet" }) {
  const look =
    variant === "primary"
      ? "bg-primary text-primary-fg"
      : variant === "quiet"
        ? "bg-transparent text-muted"
        : "border border-line bg-surface text-fg";
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-opacity duration-200 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${look} ${className}`}
    />
  );
}

export function Waveform({
  peaks,
  progress = 0,
  onSeek,
}: {
  peaks: number[];
  progress?: number;
  onSeek?: (ratio: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const color = getComputedStyle(canvas).color;
      const gap = 2;
      const bar = Math.max(2, (width - gap * peaks.length) / Math.max(1, peaks.length));
      peaks.forEach((peak, index) => {
        const barHeight = Math.max(2, peak * (height - 6));
        ctx.globalAlpha = index / Math.max(1, peaks.length) <= progress ? 1 : 0.35;
        ctx.fillStyle = color;
        const x = index * (bar + gap);
        ctx.beginPath();
        ctx.roundRect(x, (height - barHeight) / 2, Math.max(1, bar - 0.5), barHeight, 2);
        ctx.fill();
      });
    };
    draw();
  }, [peaks, progress]);
  return (
    <canvas
      ref={ref}
      className="h-16 w-full text-primary"
      role={onSeek ? "slider" : "img"}
      aria-label="Waveform"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      onPointerDown={(event) => {
        if (!onSeek) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
      }}
    />
  );
}

export function Fader({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{display}</span>
      </span>
      <Slider.Root
        className="relative flex h-11 touch-none items-center"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next ?? value)}
        aria-label={label}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-surface-2">
          <Slider.Range className="absolute h-full rounded-full bg-primary" />
        </Slider.Track>
        <Slider.Thumb className="block size-5 rounded-full border border-line bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />
      </Slider.Root>
    </div>
  );
}

export function Meter({ stemId }: { stemId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const level = mixEngine.meter(stemId);
      if (ref.current) ref.current.style.transform = `scaleX(${Math.max(0.02, level)})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stemId]);
  return (
    <span className="relative block h-1 overflow-hidden rounded-full bg-surface-2">
      <span ref={ref} className="absolute inset-0 origin-left bg-primary" />
    </span>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface p-4 ${className}`}>{children}</section>;
}
