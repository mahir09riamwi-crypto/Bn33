import { toast } from "sonner";
import { ACCEPT_EXT, PRESETS, extensionOf, getInstrument, instrumentName } from "@/lib/stem/catalog";
import {
  confidenceWord,
  detectBpm,
  detectKey,
  makePeaks,
  shiftKey,
  yieldNow,
} from "@/lib/stem/dsp";
import {
  bufferToChannels,
  containerExtension,
  encodeFormat,
  formatMime,
  zipStore,
  type AudioFormat,
} from "@/lib/stem/encode";
import {
  getAudioContext,
  mixEngine,
  playPreview,
  renderMix,
  stopPreview,
} from "@/lib/stem/engine";
import {
  demoStems,
  ensurePcm,
  forgetJob,
  getJob,
  hasStem,
  playableSource,
  playableStem,
  releaseProject,
  rememberDemo,
  rememberFile,
  retargetStem,
  samplesToBuffer,
  sliceDemo,
  stashSource,
  takeStem,
} from "@/lib/stem/session";
import { separateMono, stemIsQuiet } from "@/lib/stem/separate";
import { sumSamples, type StemScore } from "@/lib/stem/synth";
import { useStem } from "@/lib/stem/store";
import {
  defaultEq,
  defaultFx,
  defaultSettings,
  type HistoryItem,
  type Project,
  type Settings,
  type StemState,
} from "@/lib/stem/types";

const HISTORY_KEY = "stemsplit-history";
const SETTINGS_KEY = "stemsplit-settings";
const MAX_SECONDS = 120;

let themeDetach: (() => void) | null = null;

export function applyTheme(theme: Settings["theme"]) {
  try {
    localStorage.setItem("stemsplit-theme", theme);
  } catch {
    /* private mode */
  }
  themeDetach?.();
  themeDetach = null;
  const paint = (dark: boolean) => document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  if (theme === "system") {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => paint(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    themeDetach = () => query.removeEventListener("change", onChange);
    return;
  }
  paint(theme === "dark");
}

export function hydrate() {
  if (useStem.getState().hydrated) return;
  let settings = defaultSettings();
  let history: HistoryItem[] = [];
  try {
    const rawSettings = localStorage.getItem(SETTINGS_KEY);
    if (rawSettings) settings = { ...settings, ...JSON.parse(rawSettings) };
    const rawHistory = localStorage.getItem(HISTORY_KEY);
    if (rawHistory) history = JSON.parse(rawHistory);
  } catch {
    /* ignore broken storage */
  }
  applyTheme(settings.theme);
  useStem.setState({ settings, history, hydrated: true });
}

function saveSettings(settings: Settings) {
  useStem.setState({ settings });
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  applyTheme(settings.theme);
}

function saveHistory(history: HistoryItem[]) {
  useStem.setState({ history });
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

function activeProject(): Project | null {
  const { projects, activeProjectId } = useStem.getState();
  return projects.find((project) => project.id === activeProjectId) ?? null;
}

function putProject(project: Project) {
  const projects = [project, ...useStem.getState().projects.filter((item) => item.id !== project.id)];
  useStem.setState({ projects, activeProjectId: project.id });
  const files = projects.filter((item) => item.origin === "file");
  for (const old of files.slice(3)) releaseProject(old.id, old.stems.map((stem) => stem.id));
}

function stageFor(progress: number): string {
  if (progress < 0.18) return "Reading audio";
  if (progress < 0.34) return "Detecting key and tempo";
  if (progress < 0.55) return "Splitting harmony and rhythm";
  if (progress < 0.82) return "Fitting instrument profiles";
  if (progress < 0.94) return "Reducing bleed";
  return "Rendering stems";
}

export function confidenceText(value: number): string {
  return confidenceWord(value);
}

export async function importFiles(list: File[]) {
  const supported: File[] = [];
  let skipped = 0;
  for (const file of list) {
    if (ACCEPT_EXT.includes(extensionOf(file.name))) supported.push(file);
    else skipped++;
  }
  if (skipped) toast.error(`Skipped ${skipped} unsupported file${skipped > 1 ? "s" : ""}.`);
  if (!supported.length) {
    toast.error("Use MP3, WAV, FLAC, AAC, OGG, AIFF, MP4, or MKV.");
    return;
  }
  if (supported.length > 20) toast("Batch limit is 20. The first 20 were added.");
  const ids = supported.slice(0, 20).map((file) => {
    const id = crypto.randomUUID();
    rememberFile(id, file);
    return id;
  });
  const band = PRESETS.find((preset) => preset.id === "band")?.ids ?? [];
  useStem.setState({
    queue: ids,
    activeIndex: 0,
    selected: band,
    focusId: band[0] ?? "lead-vocal",
    draftTranspose: 0,
    family: "All",
    screen: "prepare",
  });
  await analyzeJob(ids[0]);
}

export async function openDemo() {
  useStem.setState({ busy: { title: "Night Market", stage: "Scoring the ensemble", progress: 0.2 } });
  await yieldNow();
  const id = crypto.randomUUID();
  const song = rememberDemo(id);
  useStem.setState({ busy: { title: "Night Market", stage: "Detecting key and tempo", progress: 0.62 } });
  await yieldNow();
  const key = detectKey(song.mix, song.sampleRate);
  const bpm = detectBpm(song.mix, song.sampleRate);
  const eastern = PRESETS[0]?.ids ?? [];
  useStem.setState((state) => ({
    busy: null,
    queue: [id],
    activeIndex: 0,
    selected: eastern,
    focusId: "oud",
    draftTranspose: 0,
    family: "All",
    screen: "prepare",
    analysis: {
      ...state.analysis,
      [id]: {
        keyName: key.name,
        keyConfidence: key.confidence,
        bpm: bpm.bpm,
        bpmConfidence: bpm.confidence,
        peaks: makePeaks(song.mix),
        duration: song.duration,
      },
    },
  }));
}

export async function analyzeJob(id: string) {
  if (!id) return;
  const existing = useStem.getState().analysis[id];
  if (existing && !existing.error) return;
  try {
    const audio = await ensurePcm(id);
    const window = audio.samples.subarray(0, Math.min(audio.samples.length, Math.floor(audio.sampleRate * 45)));
    const key = detectKey(window, audio.sampleRate);
    const bpm = detectBpm(window, audio.sampleRate);
    useStem.setState((state) => ({
      analysis: {
        ...state.analysis,
        [id]: {
          keyName: key.name,
          keyConfidence: key.confidence,
          bpm: bpm.bpm,
          bpmConfidence: bpm.confidence,
          peaks: makePeaks(audio.samples),
          duration: audio.samples.length / audio.sampleRate,
        },
      },
    }));
  } catch (error) {
    useStem.setState((state) => ({
      analysis: {
        ...state.analysis,
        [id]: {
          keyName: "—",
          keyConfidence: 0,
          bpm: 0,
          bpmConfidence: 0,
          peaks: [],
          duration: 0,
          error: error instanceof Error ? error.message : "Could not read this file",
        },
      },
    }));
  }
}

export function setScreen(screen: StemStoreScreen) {
  if (screen !== "studio") mixEngine.pause();
  if (screen !== "prepare") {
    stopPreview();
    useStem.setState({ previewing: null });
  }
  useStem.setState({ screen });
}

type StemStoreScreen = ReturnType<typeof useStem.getState>["screen"];

export function toggleInstrument(id: string) {
  const { selected } = useStem.getState();
  if (selected.includes(id)) {
    if (selected.length === 1) {
      toast("Choose at least one stem.");
      return;
    }
    useStem.setState({ selected: selected.filter((item) => item !== id), focusId: id });
    return;
  }
  useStem.setState({ selected: [...selected, id], focusId: id });
}

export function applyPreset(ids: string[]) {
  useStem.setState({ selected: ids, focusId: ids[0] ?? useStem.getState().focusId });
}

export async function focusJob(index: number) {
  const { queue } = useStem.getState();
  useStem.setState({ activeIndex: index, previewing: null });
  stopPreview();
  const id = queue[index];
  if (id) await analyzeJob(id);
}

export function removeQueued(id: string) {
  const { queue, activeIndex } = useStem.getState();
  const next = queue.filter((item) => item !== id);
  forgetJob(id);
  if (!next.length) {
    useStem.setState({ queue: [], screen: "library", activeIndex: 0 });
    return;
  }
  const index = Math.min(activeIndex, next.length - 1);
  useStem.setState({ queue: next, activeIndex: index });
  void analyzeJob(next[index]);
}

export async function previewStem() {
  const { queue, activeIndex, selected, focusId, settings } = useStem.getState();
  const jobId = queue[activeIndex];
  const instrumentId = selected.includes(focusId) ? focusId : selected[0];
  if (!jobId || !instrumentId) return;
  useStem.setState({
    busy: { title: instrumentName(instrumentId), stage: "Rendering a short preview", progress: 0.35 },
    previewing: null,
  });
  stopPreview();
  try {
    const job = getJob(jobId);
    let samples: Float32Array | null = null;
    let rate = 44100;
    if (job?.kind === "demo") {
      samples = sliceDemo(jobId, instrumentId, settings.previewSeconds);
    } else {
      const audio = await ensurePcm(jobId);
      rate = audio.sampleRate;
      const n = Math.min(audio.samples.length, Math.floor(rate * settings.previewSeconds));
      const slice = audio.samples.slice(0, n);
      useStem.setState({ busy: { title: instrumentName(instrumentId), stage: "Isolating the preview", progress: 0.6 } });
      const separated = await separateMono(slice, rate, [instrumentId]);
      samples = separated.stems[0]?.samples ?? null;
    }
    if (!samples) throw new Error("Nothing to preview.");
    const ctx = getAudioContext();
    const buffer = samplesToBuffer(ctx, samples, rate, getInstrument(instrumentId)?.width ?? 0);
    useStem.setState({ busy: null, previewing: instrumentId });
    await playPreview(buffer, () => {
      if (useStem.getState().previewing === instrumentId) useStem.setState({ previewing: null });
    });
  } catch (error) {
    useStem.setState({ busy: null });
    toast.error(error instanceof Error ? error.message : "Preview failed.");
  }
}

function recordHistory(project: Project) {
  const item: HistoryItem = {
    id: project.id,
    name: project.name,
    format: project.format,
    duration: project.duration,
    keyName: project.keyName,
    bpm: project.bpm,
    stemNames: project.stems.map((stem) => instrumentName(stem.instrumentId)),
    instrumentIds: project.stems.map((stem) => stem.sourceInstrumentId),
    createdAt: project.createdAt,
    origin: project.origin,
  };
  const history = [item, ...useStem.getState().history.filter((entry) => entry.id !== item.id)];
  saveHistory(history);
}

function buildStems(
  projectId: string,
  parts: { instrumentId: string; samples: Float32Array; score: StemScore | null }[],
  sampleRate: number,
): StemState[] {
  return parts.map((part) => {
    const id = `${projectId}:${part.instrumentId}`;
    takeStem(id, part.instrumentId, part.samples, sampleRate, part.score);
    return {
      id,
      instrumentId: part.instrumentId,
      sourceInstrumentId: part.instrumentId,
      volume: part.instrumentId === "rest" ? 0.7 : 0.82,
      muted: false,
      solo: false,
      eq: defaultEq(),
      fx: defaultFx(),
      noise: false,
      quiet: stemIsQuiet(part.samples),
    };
  });
}

async function splitJob(jobId: string, label?: string): Promise<string | null> {
  const job = getJob(jobId);
  if (!job) return null;
  const { selected, draftTranspose } = useStem.getState();
  const title = label ? `${job.name} · ${label}` : job.name;
  useStem.setState({ busy: { title, stage: "Reading audio", progress: 0.08 } });
  const audio = await ensurePcm(jobId);
  const max = Math.floor(audio.sampleRate * MAX_SECONDS);
  const truncated = audio.samples.length > max;
  const samples = truncated ? audio.samples.slice(0, max) : audio.samples;
  const rate = audio.sampleRate;
  const listen = samples.subarray(0, Math.min(samples.length, Math.floor(rate * 45)));
  useStem.setState({ busy: { title, stage: "Detecting key and tempo", progress: 0.22 } });
  await yieldNow();
  const key = detectKey(listen, rate);
  const bpm = detectBpm(listen, rate);
  const projectId = crypto.randomUUID();
  let parts: { instrumentId: string; samples: Float32Array; score: StemScore | null }[] = [];
  if (job.kind === "demo") {
    const rendered = demoStems(jobId) ?? [];
    const chosen = rendered.filter((stem) => selected.includes(stem.instrumentId));
    const skipped = rendered.filter((stem) => !selected.includes(stem.instrumentId));
    parts = chosen.map((stem) => ({
      instrumentId: stem.instrumentId,
      samples: stem.samples.slice(0, samples.length),
      score: stem.score,
    }));
    if (skipped.length) {
      parts.push({
        instrumentId: "rest",
        samples: sumSamples(
          skipped.map((stem) => stem.samples),
          samples.length,
        ),
        score: null,
      });
    }
    const stages = ["Isolating instruments", "Reducing bleed", "Balancing stems"];
    for (let step = 0; step < stages.length; step++) {
      useStem.setState({ busy: { title, stage: stages[step], progress: 0.45 + step * 0.18 } });
      await new Promise((resolve) => setTimeout(resolve, 320));
    }
  } else {
    const separated = await separateMono(samples, rate, selected, (progress) => {
      useStem.setState({
        busy: { title, stage: stageFor(0.3 + progress * 0.6), progress: 0.3 + progress * 0.6 },
      });
    });
    parts = separated.stems.map((stem) => ({ ...stem, score: null }));
    parts.push({ instrumentId: "rest", samples: separated.rest, score: null });
  }
  const project: Project = {
    id: projectId,
    name: job.name,
    format: job.format,
    duration: samples.length / rate,
    sampleRate: rate,
    keyName: key.name,
    keyConfidence: key.confidence,
    bpm: bpm.bpm,
    bpmConfidence: bpm.confidence,
    peaks: makePeaks(samples),
    stems: buildStems(projectId, parts, rate),
    master: 0.9,
    transpose: draftTranspose,
    sourceListen: false,
    origin: job.kind,
    truncated,
    createdAt: Date.now(),
  };
  stashSource(projectId, samples, rate);
  putProject(project);
  recordHistory(project);
  return projectId;
}

export async function splitCurrent() {
  if (useStem.getState().busy) return;
  const { queue, activeIndex } = useStem.getState();
  const id = queue[activeIndex];
  if (!id) return;
  try {
    const projectId = await splitJob(id);
    useStem.setState({ busy: null, screen: "studio", activeProjectId: projectId, expandedStem: null });
  } catch (error) {
    useStem.setState({ busy: null });
    toast.error(error instanceof Error ? error.message : "Split failed.");
  }
}

export async function splitAll() {
  if (useStem.getState().busy) return;
  const ids = [...useStem.getState().queue];
  if (!ids.length) return;
  let last: string | null = null;
  let done = 0;
  for (let i = 0; i < ids.length; i++) {
    try {
      last = await splitJob(ids[i], ids.length > 1 ? `${i + 1} of ${ids.length}` : undefined);
      if (last) done++;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A file failed.");
    }
  }
  useStem.setState({
    busy: null,
    screen: last ? "studio" : "prepare",
    activeProjectId: last,
    expandedStem: null,
  });
  if (done > 1) toast(`${done} files are in history.`);
}

export async function reopen(item: HistoryItem) {
  const existing = useStem.getState().projects.find((project) => project.id === item.id);
  if (existing && existing.stems.some((stem) => hasStem(stem.id))) {
    useStem.setState({ activeProjectId: existing.id, screen: "studio", expandedStem: null });
    return;
  }
  if (item.origin !== "demo") {
    toast("That audio left with the session. Import the file again.");
    return;
  }
  useStem.setState({ busy: { title: item.name, stage: "Restoring the multitrack", progress: 0.45 } });
  await yieldNow();
  const song = rememberDemo(crypto.randomUUID());
  const projectId = item.id;
  const chosen = song.stems.filter((stem) => item.instrumentIds.includes(stem.instrumentId));
  const parts = (chosen.length ? chosen : song.stems).map((stem) => ({
    instrumentId: stem.instrumentId,
    samples: stem.samples,
    score: stem.score,
  }));
  const project: Project = {
    id: projectId,
    name: item.name,
    format: "wav",
    duration: song.duration,
    sampleRate: song.sampleRate,
    keyName: item.keyName,
    keyConfidence: 0.2,
    bpm: item.bpm,
    bpmConfidence: 0.5,
    peaks: makePeaks(song.mix),
    stems: buildStems(projectId, parts, song.sampleRate),
    master: 0.9,
    transpose: 0,
    sourceListen: false,
    origin: "demo",
    truncated: false,
    createdAt: item.createdAt,
  };
  stashSource(projectId, song.mix, song.sampleRate);
  putProject(project);
  useStem.setState({ busy: null, screen: "studio", activeProjectId: projectId, expandedStem: null });
}

export function removeHistory(id: string) {
  saveHistory(useStem.getState().history.filter((item) => item.id !== id));
}

async function refreshBuffers(restart: boolean) {
  const project = activeProject();
  if (!project) return;
  const ctx = getAudioContext();
  const buffers = new Map<string, AudioBuffer>();
  for (const stem of project.stems) {
    const buffer = await playableStem(stem.id, stem.noise, project.transpose, ctx);
    if (buffer) buffers.set(stem.id, buffer);
  }
  const source = await playableSource(project.id, project.transpose, ctx);
  mixEngine.bind(project, buffers, source);
  if (restart && mixEngine.playing) mixEngine.restart();
}

function touch(project: Project, restart = false) {
  putProject(project);
  mixEngine.live(project);
  if (restart) void refreshBuffers(true);
}

export async function togglePlay() {
  const project = activeProject();
  if (!project) return;
  stopPreview();
  useStem.setState({ previewing: null });
  if (mixEngine.playing) {
    mixEngine.pause();
    return;
  }
  const ctx = getAudioContext();
  await ctx.resume();
  await refreshBuffers(false);
  mixEngine.play();
}

export function seekRatio(ratio: number) {
  const project = activeProject();
  if (!project) return;
  mixEngine.seek(Math.max(0, Math.min(0.999, ratio)) * project.duration);
}

export function setMaster(volume: number) {
  const project = activeProject();
  if (!project) return;
  touch({ ...project, master: volume });
}

export function setSourceListen(on: boolean) {
  const project = activeProject();
  if (!project) return;
  touch({ ...project, sourceListen: on });
}

export async function setTranspose(semitones: number) {
  const project = activeProject();
  if (!project) return;
  const next = { ...project, transpose: semitones };
  putProject(next);
  useStem.setState({
    busy: { title: shiftKey(project.keyName, semitones), stage: "Retuning the mix", progress: 0.5 },
  });
  await refreshBuffers(true);
  useStem.setState({ busy: null });
}

export function setDraftTranspose(semitones: number) {
  useStem.setState({ draftTranspose: semitones });
}

function editStem(stemId: string, edit: (stem: StemState) => StemState, restart = false) {
  const project = activeProject();
  if (!project) return;
  const stems = project.stems.map((stem) => (stem.id === stemId ? edit(stem) : stem));
  touch({ ...project, stems }, restart);
}

export function setVolume(stemId: string, volume: number) {
  editStem(stemId, (stem) => ({ ...stem, volume }));
}

export function toggleMute(stemId: string) {
  editStem(stemId, (stem) => ({ ...stem, muted: !stem.muted }));
}

export function toggleSolo(stemId: string) {
  editStem(stemId, (stem) => ({ ...stem, solo: !stem.solo }));
}

export function setEq(stemId: string, eq: StemState["eq"]) {
  editStem(stemId, (stem) => ({ ...stem, eq }));
}

export function setFx(stemId: string, fx: StemState["fx"]) {
  editStem(stemId, (stem) => ({ ...stem, fx }));
}

export async function setNoise(stemId: string, noise: boolean) {
  const project = activeProject();
  if (!project) return;
  const stems = project.stems.map((stem) => (stem.id === stemId ? { ...stem, noise } : stem));
  const next = { ...project, stems };
  putProject(next);
  useStem.setState({ busy: { title: "Noise cancel", stage: noise ? "Cleaning the stem" : "Restoring the stem", progress: 0.5 } });
  await refreshBuffers(true);
  useStem.setState({ busy: null });
}

export async function setNoiseAll(noise: boolean) {
  const project = activeProject();
  if (!project) return;
  const stems = project.stems.map((stem) => ({ ...stem, noise }));
  putProject({ ...project, stems });
  useStem.setState({
    busy: { title: "Noise cancel", stage: noise ? "Cleaning every stem" : "Restoring every stem", progress: 0.45 },
  });
  await refreshBuffers(true);
  useStem.setState({ busy: null });
}

export async function replaceInstrument(stemId: string, instrumentId: string) {
  const project = activeProject();
  if (!project) return;
  const stem = project.stems.find((item) => item.id === stemId);
  if (!stem || stem.instrumentId === instrumentId) return;
  useStem.setState({
    busy: { title: instrumentName(instrumentId), stage: "Replacing the instrument", progress: 0.4 },
  });
  await yieldNow();
  retargetStem(stemId, instrumentId, project.duration);
  const stems = project.stems.map((item) => (item.id === stemId ? { ...item, instrumentId, quiet: false } : item));
  putProject({ ...project, stems });
  await refreshBuffers(true);
  useStem.setState({ busy: null });
}

export function toggleExpanded(stemId: string) {
  useStem.setState({ expandedStem: useStem.getState().expandedStem === stemId ? null : stemId });
}

export function setTheme(theme: Settings["theme"]) {
  saveSettings({ ...useStem.getState().settings, theme });
}

export function setPreviewSeconds(previewSeconds: Settings["previewSeconds"]) {
  saveSettings({ ...useStem.getState().settings, previewSeconds });
}

export function setExportFormat(exportFormat: Settings["exportFormat"]) {
  saveSettings({ ...useStem.getState().settings, exportFormat });
}

function safe(name: string): string {
  const cleaned = name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "");
  return cleaned || "stemsplit";
}

function resolveFormat(requested: Settings["exportFormat"], original: string): AudioFormat {
  if (requested !== "original") return requested;
  if (requested === "original" && ["mp3", "wav", "flac", "ogg", "aac", "aiff"].includes(original)) {
    return original as AudioFormat;
  }
  return "wav";
}

async function buffersFor(project: Project): Promise<Map<string, AudioBuffer>> {
  const ctx = getAudioContext();
  const buffers = new Map<string, AudioBuffer>();
  for (const stem of project.stems) {
    const buffer = await playableStem(stem.id, stem.noise, project.transpose, ctx);
    if (buffer) buffers.set(stem.id, buffer);
  }
  return buffers;
}

export async function exportProject(target: "mix" | "all" | string, requested: Settings["exportFormat"]) {
  const project = activeProject();
  if (!project) return;
  const format = resolveFormat(requested, project.format);
  const videoNote = ["mp4", "mkv", "m4a"].includes(project.format) && requested === "original";
  useStem.setState({ busy: { title: "Export", stage: "Rendering the mix", progress: 0.35 } });
  try {
    const buffers = await buffersFor(project);
    const encode = async (rendered: AudioBuffer, stage: string) => {
      useStem.setState({ busy: { title: "Export", stage, progress: 0.72 } });
      return encodeFormat(await bufferToChannels(rendered), rendered.sampleRate, format, (value) => {
        useStem.setState({ busy: { title: "Export", stage, progress: 0.72 + value * 0.26 } });
      });
    };
    if (target === "all") {
      const files: { name: string; data: Uint8Array }[] = [];
      const mix = await renderMix({ ...project, sourceListen: false }, buffers);
      const mixData = await encode(mix, "Encoding mix");
      files.push({
        name: `${safe(project.name)}-mix.${containerExtension(format, mixData)}`,
        data: mixData,
      });
      for (let index = 0; index < project.stems.length; index++) {
        const stem = project.stems[index];
        const soloed: Project = {
          ...project,
          sourceListen: false,
          stems: project.stems.map((item) => ({
            ...item,
            solo: item.id === stem.id,
            muted: false,
          })),
        };
        const rendered = await renderMix(soloed, buffers);
        const data = await encode(rendered, `Encoding ${index + 1} of ${project.stems.length}`);
        files.push({
          name: `${safe(project.name)}-${safe(instrumentName(stem.instrumentId))}.${containerExtension(format, data)}`,
          data,
        });
      }
      download(zipStore(files), `${safe(project.name)}-stems.zip`, "application/zip");
    } else if (target === "mix") {
      const rendered = await renderMix({ ...project, sourceListen: false }, buffers);
      const data = await encode(rendered, `Encoding ${format.toUpperCase()}`);
      download(data, `${safe(project.name)}-mix.${containerExtension(format, data)}`, fileMime(format, data));
    } else {
      const soloed: Project = {
        ...project,
        sourceListen: false,
        stems: project.stems.map((item) => ({ ...item, solo: item.id === target, muted: false })),
      };
      const rendered = await renderMix(soloed, buffers);
      const stem = project.stems.find((item) => item.id === target);
      const data = await encode(rendered, `Encoding ${format.toUpperCase()}`);
      download(
        data,
        `${safe(project.name)}-${safe(instrumentName(stem?.instrumentId ?? "stem"))}.${containerExtension(format, data)}`,
        fileMime(format, data),
      );
    }
    if (videoNote) toast("Video sources export as audio.");
    toast.success("Export ready.");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Export failed.");
  } finally {
    useStem.setState({ busy: null });
  }
}

function fileMime(format: AudioFormat, data: Uint8Array): string {
  return containerExtension(format, data) === "m4a" ? "audio/mp4" : formatMime(format);
}

function download(data: Uint8Array, filename: string, mime: string) {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function continueQueue() {
  if (!useStem.getState().queue.length) return;
  useStem.setState({ screen: "prepare" });
  const id = useStem.getState().queue[useStem.getState().activeIndex];
  if (id) void analyzeJob(id);
}
