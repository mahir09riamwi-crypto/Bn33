import { AudioLines, Upload } from "lucide-react";
import { useRef } from "react";
import { continueQueue, importFiles, openDemo } from "@/lib/stem/actions";
import { ACCEPT_EXT } from "@/lib/stem/catalog";
import { formatTime, formatWhen } from "@/lib/stem/dsp";
import { useStem } from "@/lib/stem/store";
import { Button, Panel } from "@/components/stem/ui";

export function Library() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useStem((state) => state.queue);
  const history = useStem((state) => state.history);
  const hydrated = useStem((state) => state.hydrated);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-medium tracking-widest text-muted uppercase">On-device studio</p>
        <h1 className="mt-1 font-display text-4xl italic text-fg md:text-5xl">StemSplit</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Isolate a stem, hear a short preview, then mix the full split. Twenty-six instruments, from oud and
          qanun to a full drum kit.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-5">
        <Panel className="flex h-full flex-col md:col-span-3">
          <div
            className="flex flex-1 flex-col items-start justify-center gap-4 rounded-md border border-dashed border-line px-4 py-8"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const files = [...(event.dataTransfer.files ?? [])];
              if (files.length) void importFiles(files);
            }}
          >
            <Upload className="size-5 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-medium">Drop audio or video</h2>
              <p className="mt-1 text-sm text-muted">Up to 20 files. MP3, WAV, FLAC, AAC, OGG, AIFF, MP4, MKV.</p>
            </div>
            <Button variant="primary" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              multiple
              accept={ACCEPT_EXT.map((ext) => `.${ext}`).join(",")}
              aria-label="Import audio"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                if (files.length) void importFiles(files);
              }}
            />
          </div>
        </Panel>
        <Panel className="flex flex-col justify-between gap-4 md:col-span-2">
          <div>
            <p className="text-xs tracking-widest text-muted uppercase">Demo multitrack</p>
            <h2 className="mt-2 font-display text-3xl italic">Night Market</h2>
            <p className="mt-2 text-sm text-muted">Oud, qanun, nay, darbuka, violin, and double bass in A Hijaz.</p>
          </div>
          <Button variant="primary" onClick={() => void openDemo()}>
            <AudioLines className="size-4" aria-hidden="true" />
            Open session
          </Button>
        </Panel>
      </div>
      {queue.length > 0 && (
        <Button variant="ghost" className="self-start" onClick={continueQueue}>
          Continue {queue.length} file{queue.length > 1 ? "s" : ""}
        </Button>
      )}
      {hydrated && history.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">Recent</h2>
          <ul className="grid gap-2">
            {history.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-xs text-muted">
                    {item.keyName} · {item.bpm} BPM · {formatTime(item.duration)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{formatWhen(item.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
