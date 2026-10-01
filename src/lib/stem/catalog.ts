export type Family =
  | "Voice"
  | "Strings"
  | "Winds"
  | "Keys"
  | "Bass"
  | "Drums";

export type Profile = {
  harm: number;
  lo: number;
  hi: number;
  center: number;
  oct: number;
};

export type Instrument = {
  id: string;
  name: string;
  family: Family;
  eastern: boolean;
  pitched: boolean;
  width: number;
  profile: Profile;
  replaces: string[];
};

export const INSTRUMENTS: Instrument[] = [
  { id: "lead-vocal", name: "Lead vocal", family: "Voice", eastern: false, pitched: true, width: 0.008, profile: { harm: 0.86, lo: 140, hi: 4200, center: 700, oct: 1.35 }, replaces: ["backing-vocal", "nay", "violin"] },
  { id: "backing-vocal", name: "Backing vocal", family: "Voice", eastern: false, pitched: true, width: 0.014, profile: { harm: 0.82, lo: 180, hi: 5200, center: 1100, oct: 1.4 }, replaces: ["lead-vocal", "violin", "flute"] },
  { id: "violin", name: "Violin", family: "Strings", eastern: true, pitched: true, width: 0.012, profile: { harm: 0.93, lo: 180, hi: 4200, center: 660, oct: 1.2 }, replaces: ["viola", "cello", "nay"] },
  { id: "viola", name: "Viola", family: "Strings", eastern: false, pitched: true, width: 0.01, profile: { harm: 0.92, lo: 140, hi: 2800, center: 440, oct: 1.15 }, replaces: ["violin", "cello"] },
  { id: "cello", name: "Cello", family: "Strings", eastern: false, pitched: true, width: 0.008, profile: { harm: 0.9, lo: 70, hi: 1600, center: 220, oct: 1.2 }, replaces: ["violin", "viola", "double-bass"] },
  { id: "oud", name: "Oud", family: "Strings", eastern: true, pitched: true, width: 0.012, profile: { harm: 0.88, lo: 80, hi: 2800, center: 320, oct: 1.25 }, replaces: ["classic-guitar", "qanun", "acoustic-guitar"] },
  { id: "qanun", name: "Qanun", family: "Strings", eastern: true, pitched: true, width: 0.016, profile: { harm: 0.9, lo: 160, hi: 4500, center: 880, oct: 1.3 }, replaces: ["piano", "oud", "electric-piano"] },
  { id: "electric-guitar", name: "Electric guitar", family: "Strings", eastern: false, pitched: true, width: 0.014, profile: { harm: 0.74, lo: 80, hi: 5200, center: 420, oct: 1.45 }, replaces: ["classic-guitar", "acoustic-guitar", "oud"] },
  { id: "classic-guitar", name: "Classic guitar", family: "Strings", eastern: false, pitched: true, width: 0.012, profile: { harm: 0.88, lo: 90, hi: 3800, center: 400, oct: 1.3 }, replaces: ["electric-guitar", "acoustic-guitar", "oud"] },
  { id: "acoustic-guitar", name: "Acoustic guitar", family: "Strings", eastern: false, pitched: true, width: 0.011, profile: { harm: 0.86, lo: 90, hi: 4200, center: 460, oct: 1.35 }, replaces: ["classic-guitar", "electric-guitar", "oud"] },
  { id: "double-bass", name: "Double bass", family: "Bass", eastern: false, pitched: true, width: 0, profile: { harm: 0.78, lo: 35, hi: 380, center: 90, oct: 1.1 }, replaces: ["bass-guitar", "cello"] },
  { id: "bass-guitar", name: "Bass guitar", family: "Bass", eastern: false, pitched: true, width: 0, profile: { harm: 0.68, lo: 35, hi: 420, center: 100, oct: 1.15 }, replaces: ["double-bass", "synth"] },
  { id: "nay", name: "Nay", family: "Winds", eastern: true, pitched: true, width: 0.016, profile: { harm: 0.94, lo: 280, hi: 3800, center: 900, oct: 1.15 }, replaces: ["flute", "violin"] },
  { id: "flute", name: "Flute", family: "Winds", eastern: false, pitched: true, width: 0.014, profile: { harm: 0.94, lo: 280, hi: 4500, center: 1100, oct: 1.15 }, replaces: ["nay", "violin"] },
  { id: "brass", name: "Brass", family: "Winds", eastern: false, pitched: true, width: 0.018, profile: { harm: 0.9, lo: 140, hi: 4000, center: 520, oct: 1.3 }, replaces: ["synth", "violin", "cello"] },
  { id: "piano", name: "Piano", family: "Keys", eastern: false, pitched: true, width: 0.01, profile: { harm: 0.8, lo: 70, hi: 5200, center: 480, oct: 1.7 }, replaces: ["electric-piano", "qanun", "synth"] },
  { id: "electric-piano", name: "Electric piano", family: "Keys", eastern: false, pitched: true, width: 0.012, profile: { harm: 0.78, lo: 70, hi: 4200, center: 440, oct: 1.4 }, replaces: ["piano", "synth", "qanun"] },
  { id: "synth", name: "Synth", family: "Keys", eastern: false, pitched: true, width: 0.02, profile: { harm: 0.7, lo: 50, hi: 7000, center: 400, oct: 1.8 }, replaces: ["electric-piano", "piano", "brass"] },
  { id: "kick", name: "Kick", family: "Drums", eastern: false, pitched: false, width: 0, profile: { harm: 0.05, lo: 30, hi: 180, center: 70, oct: 0.8 }, replaces: ["darbuka", "frame-drum"] },
  { id: "snare", name: "Snare", family: "Drums", eastern: false, pitched: false, width: 0.004, profile: { harm: 0.14, lo: 150, hi: 5000, center: 280, oct: 1.4 }, replaces: ["darbuka", "frame-drum", "percussion"] },
  { id: "hi-hat", name: "Hi-hat", family: "Drums", eastern: false, pitched: false, width: 0.01, profile: { harm: 0.04, lo: 3500, hi: 16000, center: 7000, oct: 0.9 }, replaces: ["cymbals", "percussion"] },
  { id: "cymbals", name: "Cymbals", family: "Drums", eastern: false, pitched: false, width: 0.016, profile: { harm: 0.05, lo: 2000, hi: 16000, center: 6000, oct: 1.1 }, replaces: ["hi-hat", "percussion"] },
  { id: "drum-kit", name: "Drum kit", family: "Drums", eastern: false, pitched: false, width: 0.006, profile: { harm: 0.12, lo: 40, hi: 12000, center: 220, oct: 2.2 }, replaces: ["darbuka", "frame-drum", "percussion"] },
  { id: "darbuka", name: "Darbuka", family: "Drums", eastern: true, pitched: false, width: 0.004, profile: { harm: 0.16, lo: 70, hi: 4500, center: 200, oct: 1.6 }, replaces: ["drum-kit", "frame-drum", "kick"] },
  { id: "frame-drum", name: "Frame drum", family: "Drums", eastern: true, pitched: false, width: 0.006, profile: { harm: 0.1, lo: 50, hi: 2800, center: 160, oct: 1.4 }, replaces: ["darbuka", "drum-kit", "percussion"] },
  { id: "percussion", name: "Percussion", family: "Drums", eastern: false, pitched: false, width: 0.01, profile: { harm: 0.1, lo: 80, hi: 9000, center: 500, oct: 1.8 }, replaces: ["darbuka", "frame-drum", "drum-kit"] },
];

export const PRESETS: { id: string; name: string; ids: string[] }[] = [
  { id: "eastern", name: "Eastern", ids: ["oud", "qanun", "nay", "darbuka", "violin", "double-bass"] },
  { id: "band", name: "Studio band", ids: ["lead-vocal", "drum-kit", "bass-guitar", "electric-guitar", "piano", "classic-guitar"] },
  { id: "rhythm", name: "Rhythm", ids: ["kick", "snare", "hi-hat", "darbuka", "frame-drum", "cymbals"] },
  { id: "strings", name: "Strings", ids: ["violin", "viola", "cello", "oud", "qanun"] },
];

const byId = new Map(INSTRUMENTS.map((item) => [item.id, item]));

export function getInstrument(id: string): Instrument | undefined {
  return byId.get(id);
}

export function instrumentName(id: string): string {
  if (id === "rest") return "Rest of mix";
  return byId.get(id)?.name ?? id;
}

export function instrumentFamily(id: string): string {
  if (id === "rest") return "Accompaniment";
  return byId.get(id)?.family ?? "";
}

export const FAMILIES = ["All", "Eastern", "Voice", "Strings", "Winds", "Keys", "Bass", "Drums"] as const;
export type FamilyFilter = (typeof FAMILIES)[number];

export const ACCEPT_EXT = ["mp3", "wav", "flac", "aac", "ogg", "aiff", "aif", "mp4", "mkv", "m4a"];

export function extensionOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "aif" ? "aiff" : ext;
}
