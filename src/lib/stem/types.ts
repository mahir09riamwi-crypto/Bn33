import type { FamilyFilter } from "@/lib/stem/catalog";

export type EqState = { low: number; mid: number; high: number; midFreq: number };
export type FxState = { reverb: number; chorus: number; flanger: number; phaser: number };

export const defaultEq = (): EqState => ({ low: 0, mid: 0, high: 0, midFreq: 1000 });
export const defaultFx = (): FxState => ({ reverb: 0, chorus: 0, flanger: 0, phaser: 0 });

export type StemState = {
  id: string;
  instrumentId: string;
  sourceInstrumentId: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  eq: EqState;
  fx: FxState;
  noise: boolean;
  quiet: boolean;
};

export type Project = {
  id: string;
  name: string;
  format: string;
  duration: number;
  sampleRate: number;
  keyName: string;
  keyConfidence: number;
  bpm: number;
  bpmConfidence: number;
  peaks: number[];
  stems: StemState[];
  master: number;
  transpose: number;
  sourceListen: boolean;
  origin: "demo" | "file";
  truncated: boolean;
  createdAt: number;
};

export type HistoryItem = {
  id: string;
  name: string;
  format: string;
  duration: number;
  keyName: string;
  bpm: number;
  stemNames: string[];
  instrumentIds: string[];
  createdAt: number;
  origin: "demo" | "file";
};

export type Settings = {
  theme: "dark" | "light" | "system";
  previewSeconds: 6 | 8 | 12;
  exportFormat: "original" | "mp3" | "wav" | "flac" | "ogg" | "aac" | "aiff";
};

export type Analysis = {
  keyName: string;
  keyConfidence: number;
  bpm: number;
  bpmConfidence: number;
  peaks: number[];
  duration: number;
  error?: string;
};

export type Screen = "library" | "prepare" | "studio" | "history" | "settings";

export type Busy = { title: string; stage: string; progress: number };

export type StemStore = {
  screen: Screen;
  queue: string[];
  activeIndex: number;
  selected: string[];
  focusId: string;
  draftTranspose: number;
  family: FamilyFilter;
  projects: Project[];
  activeProjectId: string | null;
  history: HistoryItem[];
  settings: Settings;
  expandedStem: string | null;
  hydrated: boolean;
  busy: Busy | null;
  analysis: Record<string, Analysis>;
  previewing: string | null;
};

export const defaultSettings = (): Settings => ({
  theme: "dark",
  previewSeconds: 8,
  exportFormat: "wav",
});
