import { reopen, removeHistory } from "@/lib/stem/actions";
import { formatTime, formatWhen } from "@/lib/stem/dsp";
import { hasStem } from "@/lib/stem/session";
import { useStem } from "@/lib/stem/store";
import { Button } from "@/components/stem/ui";

export function HistoryScreen() {
  const history = useStem((state) => state.history);
  const projects = useStem((state) => state.projects);
  const hydrated = useStem((state) => state.hydrated);
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-xs tracking-widest text-muted uppercase">Session log</p>
        <h1 className="font-display text-4xl italic">History</h1>
      </header>
      {!hydrated ? null : history.length === 0 ? (
        <p className="text-sm text-muted">Splits you finish will be listed here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {history.map((item) => {
            const project = projects.find((entry) => entry.id === item.id);
            const resident = Boolean(project?.stems.some((stem) => hasStem(stem.id)));
            return (
              <li key={item.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">{item.name}</h2>
                    <p className="text-xs text-muted">
                      {item.keyName} · {item.bpm} BPM · {formatTime(item.duration)} · {item.format.toUpperCase()}
                    </p>
                    <p className="mt-1 text-sm text-muted">{item.stemNames.join(" · ")}</p>
                    <p className="mt-1 text-xs text-muted">{formatWhen(item.createdAt)}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {(resident || item.origin === "demo") && (
                    <Button variant="primary" onClick={() => void reopen(item)}>
                      Open
                    </Button>
                  )}
                  <Button variant="quiet" onClick={() => removeHistory(item.id)}>
                    Remove
                  </Button>
                </div>
                {!resident && item.origin === "file" && (
                  <p className="mt-2 text-xs text-muted">Audio from this visit was released. Import the file again to mix it.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
