import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import {
  analyzeJob,
  applyPreset,
  confidenceText,
  focusJob,
  previewStem,
  removeQueued,
  setDraftTranspose,
  setScreen,
  splitAll,
  splitCurrent,
  toggleInstrument,
} from "@/lib/stem/actions";
import { FAMILIES, INSTRUMENTS, PRESETS, instrumentName } from "@/lib/stem/catalog";
import { formatBytes, formatTime, shiftKey } from "@/lib/stem/dsp";
import { getJob } from "@/lib/stem/session";
import { useStem } from "@/lib/stem/store";
import { Button, Fader, Panel, Waveform } from "@/components/stem/ui";

export function Prepare() {
  const queue = useStem((state) => state.queue);
  const activeIndex = useStem((state) => state.activeIndex);
  const selected = useStem((state) => state.selected);
  const focusId = useStem((state) => state.focusId);
  const family = useStem((state) => state.family);
  const draft = useStem((state) => state.draftTranspose);
  const analysis = useStem((state) => state.analysis);
  const previewing = useStem((state) => state.previewing);
  const jobId = queue[activeIndex];
  const job = jobId ? getJob(jobId) : undefined;
  const info = jobId ? analysis[jobId] : undefined;
  const focus = selected.includes(focusId) ? focusId : selected[0];
  const visible =
    family === "All"
      ? INSTRUMENTS
      : family === "Eastern"
        ? INSTRUMENTS.filter((item) => item.eastern)
        : INSTRUMENTS.filter((item) => item.family === family);

  useEffect(() => {
    if (jobId) void analyzeJob(jobId);
  }, [jobId]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button variant="quiet" className="px-2" onClick={() => setScreen("library")}>
          <ChevronLeft className="size-5" aria-hidden="true" />
          Library
        </Button>
      </div>
      <header>
        <p className="text-xs tracking-widest text-muted uppercase">Before the split</p>
        <h1 className="mt-1 truncate font-display text-4xl italic">{job?.name ?? "Audio"}</h1>
        {job && (
          <p className="mt-1 text-sm text-muted">
            {job.format.toUpperCase()}
            {job.kind === "file" ? ` · ${formatBytes(job.size)}` : " · multitrack"}
            {info && !info.error ? ` · ${formatTime(info.duration)}` : ""}
          </p>
        )}
      </header>
      {queue.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {queue.map((id, index) => {
            const item = getJob(id);
            return (
              <button
                key={id}
                className={`h-11 max-w-40 shrink-0 truncate rounded-md border px-3 text-sm ${index === activeIndex ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface"}`}
                onClick={() => void focusJob(index)}
              >
                {item?.name ?? "File"}
              </button>
            );
          })}
        </div>
      )}
      <Panel>
        {info?.error ? (
          <p className="text-sm text-danger">{info.error}</p>
        ) : info ? (
          <div className="flex flex-col gap-4">
            <Waveform peaks={info.peaks} progress={1} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="font-display text-3xl">{shiftKey(info.keyName, draft)}</p>
                <p className="text-xs text-muted">Detected key · {confidenceText(info.keyConfidence)}</p>
              </div>
              <div>
                <p className="font-display text-3xl tabular-nums">{info.bpm || "—"}</p>
                <p className="text-xs text-muted">BPM · {confidenceText(info.bpmConfidence)}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Listening for key and tempo…</p>
        )}
      </Panel>
      <Fader
        label="Transpose before split"
        min={-12}
        max={12}
        step={1}
        value={draft}
        display={`${draft > 0 ? "+" : ""}${draft} st`}
        onChange={setDraftTranspose}
      />
      <div className="flex gap-2 overflow-x-auto">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            className="h-11 shrink-0 rounded-md border border-line bg-surface px-3 text-sm"
            onClick={() => applyPreset(preset.ids)}
          >
            {preset.name}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {FAMILIES.map((item) => (
          <button
            key={item}
            className={`h-10 shrink-0 rounded-full px-3 text-sm ${family === item ? "bg-primary text-primary-fg" : "text-muted"}`}
            onClick={() => useStem.setState({ family: item })}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {visible.map((instrument) => {
          const on = selected.includes(instrument.id);
          return (
            <button
              key={instrument.id}
              aria-pressed={on}
              onClick={() => toggleInstrument(instrument.id)}
              className={`min-h-14 rounded-md border px-3 py-2 text-left ${on ? "border-primary bg-primary/15" : "border-line bg-surface"}`}
            >
              <span className="block text-sm font-medium">{instrument.name}</span>
              <span className="text-xs text-muted">
                {instrument.eastern ? "Eastern · " : ""}
                {instrument.family}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted">Preview confirms the stem. Split in full builds the mixer.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="ghost" disabled={!focus || Boolean(info?.error)} onClick={() => void previewStem()}>
          {previewing ? `Playing ${instrumentName(previewing)}` : `Preview ${focus ? instrumentName(focus) : "stem"}`}
        </Button>
        <Button variant="primary" disabled={!selected.length || Boolean(info?.error)} onClick={() => void splitCurrent()}>
          Split in full
        </Button>
        {queue.length > 1 && (
          <Button variant="ghost" onClick={() => void splitAll()}>
            Split all {queue.length}
          </Button>
        )}
      </div>
      {job && queue.length > 1 && (
        <button className="self-start text-sm text-danger" onClick={() => removeQueued(job.id)}>
          Remove this file
        </button>
      )}
    </div>
  );
}
