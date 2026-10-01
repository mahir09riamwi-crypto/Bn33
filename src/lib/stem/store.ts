import { create } from "zustand";
import { PRESETS } from "@/lib/stem/catalog";
import { defaultSettings, type StemStore } from "@/lib/stem/types";

const eastern = PRESETS[0]?.ids ?? [];

export const useStem = create<StemStore>(() => ({
  screen: "library",
  queue: [],
  activeIndex: 0,
  selected: eastern,
  focusId: eastern[0] ?? "oud",
  draftTranspose: 0,
  family: "All",
  projects: [],
  activeProjectId: null,
  history: [],
  settings: defaultSettings(),
  expandedStem: null,
  hydrated: false,
  busy: null,
  analysis: {},
  previewing: null,
}));
