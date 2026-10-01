import { History, Library, Settings, SlidersHorizontal } from "lucide-react";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { hydrate, setScreen } from "@/lib/stem/actions";
import { useStem } from "@/lib/stem/store";
import type { Screen } from "@/lib/stem/types";
import { HistoryScreen } from "@/components/stem/history";
import { Library as LibraryScreen } from "@/components/stem/library";
import { Prepare } from "@/components/stem/prepare";
import { Settings as SettingsScreen } from "@/components/stem/settings";
import { Studio } from "@/components/stem/studio";

const NAV: { id: Screen; label: string; icon: typeof Library }[] = [
  { id: "library", label: "Library", icon: Library },
  { id: "studio", label: "Mix", icon: SlidersHorizontal },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Shell() {
  const screen = useStem((state) => state.screen);
  const busy = useStem((state) => state.busy);
  const activeProjectId = useStem((state) => state.activeProjectId);
  const theme = useStem((state) => state.settings.theme);

  useEffect(() => {
    hydrate();
  }, []);

  const go = (id: Screen) => {
    if (id === "studio") {
      if (!activeProjectId) return;
      setScreen("studio");
      return;
    }
    setScreen(id === "library" ? "library" : id);
  };

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto grid min-h-dvh max-w-6xl md:grid-cols-[220px_1fr]">
        <aside className="hidden flex-col gap-6 border-r border-line px-4 py-6 md:flex">
          <div>
            <p className="font-display text-3xl italic">StemSplit</p>
            <p className="text-xs text-muted">Stem studio</p>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = screen === item.id || (item.id === "library" && screen === "prepare");
              const disabled = item.id === "studio" && !activeProjectId;
              return (
                <button
                  key={item.id}
                  disabled={disabled}
                  onClick={() => go(item.id)}
                  className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm ${active ? "bg-surface-2 text-fg" : "text-muted"} disabled:opacity-40`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">
          <main className="px-4 pt-6 pb-28 md:px-8 md:pb-10">
            {screen === "library" && <LibraryScreen />}
            {screen === "prepare" && <Prepare />}
            {screen === "studio" && <Studio />}
            {screen === "history" && <HistoryScreen />}
            {screen === "settings" && <SettingsScreen />}
          </main>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = screen === item.id || (item.id === "library" && screen === "prepare");
            const disabled = item.id === "studio" && !activeProjectId;
            return (
              <li key={item.id}>
                <button
                  disabled={disabled}
                  onClick={() => go(item.id)}
                  className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-xs ${active ? "text-primary" : "text-muted"} disabled:opacity-40`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {busy && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-fg/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-5">
            <p className="text-xs tracking-widest text-muted uppercase">Helix</p>
            <h2 className="mt-1 font-display text-3xl italic">{busy.title}</h2>
            <p className="mt-2 text-sm">{busy.stage}</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary" style={{ width: `${Math.round(busy.progress * 100)}%` }} />
            </div>
          </div>
        </div>
      )}
      <Toaster
        position="top-center"
        theme={theme === "light" ? "light" : "dark"}
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            color: "var(--color-fg)",
            border: "1px solid var(--color-line)",
          },
        }}
      />
    </div>
  );
}
