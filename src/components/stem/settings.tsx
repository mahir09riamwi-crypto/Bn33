import { setExportFormat, setPreviewSeconds, setTheme } from "@/lib/stem/actions";
import { useStem } from "@/lib/stem/store";
import type { Settings } from "@/lib/stem/types";

const themes: { id: Settings["theme"]; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const lengths: Settings["previewSeconds"][] = [6, 8, 12];

const formats: Settings["exportFormat"][] = ["wav", "mp3", "flac", "ogg", "aac", "aiff", "original"];

export function Settings() {
  const settings = useStem((state) => state.settings);
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header>
        <p className="text-xs tracking-widest text-muted uppercase">Preferences</p>
        <h1 className="font-display text-4xl italic">Settings</h1>
      </header>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Appearance</h2>
        <div className="grid grid-cols-3 gap-2">
          {themes.map((theme) => (
            <button
              key={theme.id}
              className={`h-11 rounded-md border text-sm ${settings.theme === theme.id ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface"}`}
              onClick={() => setTheme(theme.id)}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Preview length</h2>
        <div className="grid grid-cols-3 gap-2">
          {lengths.map((seconds) => (
            <button
              key={seconds}
              className={`h-11 rounded-md border text-sm ${settings.previewSeconds === seconds ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface"}`}
              onClick={() => setPreviewSeconds(seconds)}
            >
              {seconds}s
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Default export</h2>
        <div className="flex flex-wrap gap-2">
          {formats.map((format) => (
            <button
              key={format}
              className={`h-10 rounded-md border px-3 text-sm uppercase ${settings.exportFormat === format ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface"}`}
              onClick={() => setExportFormat(format)}
            >
              {format}
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2 text-sm text-muted">
        <h2 className="text-sm font-medium text-fg">Helix</h2>
        <p>
          Imported songs are split in the browser. Helix separates harmonic and percussive energy, then fits each
          stem to an instrument profile — oud, qanun, nay, darbuka, violin, and the rest of the studio set.
        </p>
        <p>Night Market is a composed multitrack, so those stems stay isolated when you solo them. Transpose, EQ, and effects are printed into the export.</p>
      </section>
    </div>
  );
}
