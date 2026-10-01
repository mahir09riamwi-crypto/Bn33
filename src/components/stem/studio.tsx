import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { ChevronDown, ChevronLeft, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import {
  exportProject,
  replaceInstrument,
  seekRatio,
  setEq,
  setFx,
  setMaster,
  setNoise,
  setNoiseAll,
  setSourceListen,
  setTranspose,
  setVolume,
  toggleExpanded,
  toggleMute,
  togglePlay,
  toggleSolo,
  setScreen,
} from "@/lib/stem/actions";
import { getInstrument, instrumentFamily, instrumentName } from "@/lib/stem/catalog";
import { dbLabel, formatTime, shiftKey } from "@/lib/stem/dsp";
import { mixEngine } from "@/lib/stem/engine";
import { useStem } from "@/lib/stem/store";
import type { Settings, StemState } from "@/lib/stem/types";
import { Button, Fader, Meter, Panel, Waveform } from "@/components/stem/ui";

const FORMATS: { id: Settings["exportFormat"]; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "mp3", label: "MP3" },
  { id: "wav", label: "WAV" },
  { id: "flac", label: "FLAC" },
  { id: "ogg", label: "OGG" },
  { id: "aac", label: "AAC" },
  { id: "aiff", label: "AIFF" },
];

export function Studio() {
  const projectId = useStem((state) => state.activeProjectId);
  const project = useStem((state) => state.projects.find((item) => item.id === projectId));
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      event.preventDefault();
      void togglePlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!project) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl italic">No mix open</h1>
        <Button variant="primary" className="self-start" onClick={() => setScreen("library")}>
          Back to library
        </Button>
      </div>
    );
  }

  const allNoise = project.stems.every((stem) => stem.noise);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="quiet" className="px-2" onClick={() => setScreen("library")}>
          <ChevronLeft className="size-5" aria-hidden="true" />
          Library
        </Button>
        <Button variant="primary" onClick={() => setExportOpen(true)}>
          Export
        </Button>
      </div>
      <header className="min-w-0">
        <h1 className="truncate font-display text-4xl italic">{project.name}</h1>
        <p className="text-sm text-muted">
          {project.origin === "demo" ? "Multitrack session" : "Helix split"} · {project.stems.length} stems
          {project.truncated ? " · first 2 minutes" : ""}
        </p>
      </header>
      <Transport />
      <Panel className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-display text-3xl">{shiftKey(project.keyName, project.transpose)}</p>
            <p className="text-xs text-muted">
              {project.transpose === 0 ? "Detected key" : `From ${project.keyName}`}
            </p>
          </div>
          <div>
            <p className="font-display text-3xl tabular-nums">{project.bpm}</p>
            <p className="text-xs text-muted">BPM</p>
          </div>
        </div>
        <Fader
          label="Transpose"
          min={-12}
          max={12}
          step={1}
          value={project.transpose}
          display={`${project.transpose > 0 ? "+" : ""}${project.transpose} st`}
          onChange={(value) => void setTranspose(value)}
        />
        <Fader label="Master" value={project.master} display={dbLabel(project.master)} onChange={setMaster} />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Noise cancel</p>
            <p className="text-xs text-muted">All stems, or open one instrument</p>
          </div>
          <Switch.Root
            checked={allNoise}
            onCheckedChange={(on) => void setNoiseAll(on)}
            aria-label="Noise cancel all stems"
            className="relative h-8 w-14 shrink-0 rounded-full bg-surface-2 data-[state=checked]:bg-primary"
          >
            <Switch.Thumb className="block size-6 translate-x-1 rounded-full bg-fg transition-transform data-[state=checked]:translate-x-7 data-[state=checked]:bg-primary-fg" />
          </Switch.Root>
        </div>
        <Button
          variant={project.sourceListen ? "primary" : "ghost"}
          onClick={() => setSourceListen(!project.sourceListen)}
        >
          {project.sourceListen ? "Hearing source" : "A/B source"}
        </Button>
      </Panel>
      <ul className="flex flex-col gap-2">
        {project.stems.map((stem) => (
          <StemRow key={stem.id} stem={stem} />
        ))}
      </ul>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}

function Transport() {
  const projectId = useStem((state) => state.activeProjectId);
  const project = useStem((state) => state.projects.find((item) => item.id === projectId));
  const [, setFrame] = useState(0);
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      if (project && mixEngine.playing && mixEngine.currentTime() >= project.duration - 0.05) mixEngine.finish();
      setFrame((value) => (value + 1) % 100000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [project]);
  if (!project) return null;
  const time = mixEngine.currentTime();
  const progress = project.duration ? time / project.duration : 0;
  return (
    <Panel className="flex flex-col gap-3">
      <Waveform peaks={project.peaks} progress={progress} onSeek={seekRatio} />
      <div className="flex items-center gap-3">
        <button
          className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-fg"
          onClick={() => void togglePlay()}
          aria-label={mixEngine.playing ? "Pause mix" : "Play mix"}
        >
          {mixEngine.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <p className="tabular-nums text-sm">
          {formatTime(time)} <span className="text-muted">/ {formatTime(project.duration)}</span>
        </p>
        <p className="hidden text-xs text-muted md:block">Space to play</p>
      </div>
    </Panel>
  );
}

function StemRow({ stem }: { stem: StemState }) {
  const expanded = useStem((state) => state.expandedStem === stem.id);
  const options = replacementOptions(stem.sourceInstrumentId);
  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{instrumentName(stem.instrumentId)}</p>
          <p className="text-xs text-muted">
            {instrumentFamily(stem.instrumentId)}
            {stem.quiet ? " · quiet in this song" : ""}
            {stem.instrumentId !== stem.sourceInstrumentId ? ` · was ${instrumentName(stem.sourceInstrumentId)}` : ""}
          </p>
        </div>
        <button className="flex size-11 items-center justify-center" aria-expanded={expanded} aria-label="Stem controls" onClick={() => toggleExpanded(stem.id)}>
          <ChevronDown className={`size-5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div className="mt-2">
        <Meter stemId={stem.id} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          aria-pressed={stem.muted}
          aria-label={`Mute ${instrumentName(stem.instrumentId)}`}
          className={`size-11 rounded-md border text-sm font-medium ${stem.muted ? "border-fg bg-fg text-bg" : "border-line"}`}
          onClick={() => toggleMute(stem.id)}
        >
          M
        </button>
        <button
          aria-pressed={stem.solo}
          aria-label={`Solo ${instrumentName(stem.instrumentId)}`}
          className={`size-11 rounded-md border text-sm font-medium ${stem.solo ? "border-primary bg-primary text-primary-fg" : "border-line"}`}
          onClick={() => toggleSolo(stem.id)}
        >
          S
        </button>
        <div className="min-w-0 flex-1">
          <Fader
            label={`${instrumentName(stem.instrumentId)} volume`}
            value={stem.volume}
            display={dbLabel(stem.volume)}
            onChange={(value) => setVolume(stem.id, value)}
          />
        </div>
      </div>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
          {stem.sourceInstrumentId !== "rest" && options.length > 1 && (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Replace with
              <select
                className="h-11 rounded-md border border-line bg-surface-2 px-3 text-sm text-fg"
                value={stem.instrumentId}
                onChange={(event) => void replaceInstrument(stem.id, event.target.value)}
              >
                {options.map((id) => (
                  <option key={id} value={id}>
                    {instrumentName(id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs tracking-widest text-muted uppercase">Parametric EQ</p>
          <Fader label="Low" min={-12} max={12} step={0.5} value={stem.eq.low} display={`${stem.eq.low} dB`} onChange={(low) => setEq(stem.id, { ...stem.eq, low })} />
          <Fader label="Mid" min={-12} max={12} step={0.5} value={stem.eq.mid} display={`${stem.eq.mid} dB`} onChange={(mid) => setEq(stem.id, { ...stem.eq, mid })} />
          <Fader
            label="Mid frequency"
            min={200}
            max={5000}
            step={10}
            value={stem.eq.midFreq}
            display={`${Math.round(stem.eq.midFreq)} Hz`}
            onChange={(midFreq) => setEq(stem.id, { ...stem.eq, midFreq })}
          />
          <Fader label="High" min={-12} max={12} step={0.5} value={stem.eq.high} display={`${stem.eq.high} dB`} onChange={(high) => setEq(stem.id, { ...stem.eq, high })} />
          <p className="text-xs tracking-widest text-muted uppercase">Effects</p>
          <Fader label="Reverb" value={stem.fx.reverb} display={`${Math.round(stem.fx.reverb * 100)}%`} onChange={(reverb) => setFx(stem.id, { ...stem.fx, reverb })} />
          <Fader label="Chorus" value={stem.fx.chorus} display={`${Math.round(stem.fx.chorus * 100)}%`} onChange={(chorus) => setFx(stem.id, { ...stem.fx, chorus })} />
          <Fader label="Flanger" value={stem.fx.flanger} display={`${Math.round(stem.fx.flanger * 100)}%`} onChange={(flanger) => setFx(stem.id, { ...stem.fx, flanger })} />
          <Fader label="Phaser" value={stem.fx.phaser} display={`${Math.round(stem.fx.phaser * 100)}%`} onChange={(phaser) => setFx(stem.id, { ...stem.fx, phaser })} />
          <div className="flex items-center justify-between">
            <p className="text-sm">Noise cancel this stem</p>
            <Switch.Root
              checked={stem.noise}
              onCheckedChange={(on) => void setNoise(stem.id, on)}
              aria-label={`Noise cancel ${instrumentName(stem.instrumentId)}`}
              className="relative h-8 w-14 rounded-full bg-surface-2 data-[state=checked]:bg-primary"
            >
              <Switch.Thumb className="block size-6 translate-x-1 rounded-full bg-fg transition-transform data-[state=checked]:translate-x-7 data-[state=checked]:bg-primary-fg" />
            </Switch.Root>
          </div>
        </div>
      )}
    </li>
  );
}

function replacementOptions(sourceId: string): string[] {
  const instrument = getInstrument(sourceId);
  if (!instrument) return [];
  return [sourceId, ...instrument.replaces.filter((id) => id !== sourceId)];
}

function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const projectId = useStem((state) => state.activeProjectId);
  const project = useStem((state) => state.projects.find((item) => item.id === projectId));
  const preferred = useStem((state) => state.settings.exportFormat);
  const [format, setFormat] = useState<Settings["exportFormat"]>(preferred);
  const [target, setTarget] = useState<string>("mix");
  useEffect(() => setFormat(preferred), [preferred, open]);
  if (!project) return null;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-fg/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-line bg-surface p-5">
          <Dialog.Title className="font-display text-3xl italic">Export</Dialog.Title>
          <Dialog.Description className="text-sm text-muted">
            The file includes faders, EQ, effects, mute, solo, transpose, and noise cancel.
          </Dialog.Description>
          <label className="flex flex-col gap-1 text-xs text-muted">
            What
            <select
              className="h-11 rounded-md border border-line bg-surface-2 px-3 text-sm text-fg"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="mix">Full mix</option>
              <option value="all">All stems (zip)</option>
              {project.stems.map((stem) => (
                <option key={stem.id} value={stem.id}>
                  {instrumentName(stem.instrumentId)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((item) => (
              <button
                key={item.id}
                className={`h-10 rounded-md border px-3 text-sm ${format === item.id ? "border-primary bg-primary text-primary-fg" : "border-line"}`}
                onClick={() => setFormat(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                void exportProject(target, format);
                onOpenChange(false);
              }}
            >
              Download
            </Button>
            <Dialog.Close asChild>
              <Button variant="ghost">Close</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
