import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2,
  Scissors,
  SkipBack,
  Play,
  Pause,
  Square,
  Circle,
  SkipForward,
  Repeat,
  Settings as SettingsIcon,
  Search,
  Upload,
  Download,
  Pencil,
  X,
  SlidersHorizontal,
  WandSparkles,
  ZoomIn,
  ZoomOut,
  PanelRightClose,
  PanelRightOpen,
  PictureInPicture2,
  FolderOpen,
  Save,
  Share2,
  LockKeyhole,
  UnlockKeyhole,
  Undo2,
  Redo2,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "./Logo";
import { COLORS, PLUGINS, PRESETS, getPluginFamily, getPluginSettings } from "./data";
import { LoadingOverlay } from "./LoadingOverlay";
import {
  engine,
  computePeaks,
  defaultFx,
  defaultTrackRouting,
  routingWouldCycle,
  sliceBuffer,
  type TrackState,
  type Fx,
  type BusSendSlot,
} from "./engine";
import { Meter, Clock, Playhead, LoudnessReadout, Spectrum } from "./live";
import { AnalysisPanel } from "./AnalysisPanel";
import { SettingsModal, type Settings } from "./SettingsModal";
import { MixerFader } from "./MixerFader";
import { AssistantPanel } from "./AssistantPanel";
import type { AiMixAction } from "./ai-mix-types";
import { describeAiAction, validateAiMixActions } from "./ai-mix-controller";
import { InsertPicker, PluginSlots, PluginWindow, type InsertTarget } from "./PluginRack";
import { AccountMenu } from "./AccountMenu";
import { TemplateLibrary } from "./TemplateLibrary";
import {
  MIX_TEMPLATES,
  applyTemplateToTrack,
  TEMPLATE_MIX_DEFAULTS,
  type MixTemplate,
} from "./templates";
import { SendSlots } from "./SendSlots";
import {
  createKreativeProject,
  downloadKreativeProject,
  projectAudioFile,
  readKreativeProject,
  type KreativeProjectFile,
} from "./project-file";
import { ExportDialog } from "./ExportDialog";
import { compareRenderedAudio } from "./audio-analysis";
import {
  audioTracks,
  captureMix,
  createZip,
  encodeMp3,
  encodeWav,
  safeFileName,
  tracksForStem,
  type ExportOptions,
} from "./export-audio";

function Wave({ peaks, fill }: { peaks: number[]; fill: string }) {
  const d = useMemo(() => {
    const top = peaks.map((p, i) => `L${i} ${50 - p * 48}`).join(" ");
    const bottom = [...peaks]
      .reverse()
      .map((p, i) => `L${peaks.length - 1 - i} ${50 + p * 48}`)
      .join(" ");
    return `M0 50 ${top} ${bottom} Z`;
  }, [peaks]);
  return (
    <svg viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" className="h-full w-full">
      <path d={d} className={fill} />
    </svg>
  );

}

type BillingUsage = {
  plan: "K-GO" | "K-PRO";
  sessionsRemaining: number;
  sessionsLimit: number;
  cancelAtPeriodEnd?: boolean;
};

type Rec = {
  mr: MediaRecorder;
  chunks: Blob[];
  start: number;
  stream: MediaStream;
  trackId: string;
  analyser: AnalyserNode;
  meterTimer: number;
};
type MixUndo = { tracks: TrackState[]; masterVolume: number };
type HistorySnapshot = { tracks: TrackState[]; masterVolume: number };
type HistoryEntry = HistorySnapshot & { description: string };
type GridDivision = "free" | "1/2" | "1/4" | "1/8" | "1/16" | "1/32";
type TimelineSelection = { start: number; end: number };
const GRID_BEATS: Record<Exclude<GridDivision, "free">, number> = {
  "1/2": 1,
  "1/4": 0.5,
  "1/8": 0.25,
  "1/16": 0.125,
  "1/32": 0.0625,
};

const PLUGIN_DISABLE_SETTINGS: Record<string, Partial<Fx>> = {
  compressor: { compOn: false },
  gate: { dynMode: 0 },
  parametricEq: { eqBands: [] },
  consoleEq: {
    eqLow: 0,
    eqMid: 0,
    eqHighMid: 0,
    eqHigh: 0,
    hpOn: false,
    lpOn: false,
  },
  amp: { ampModel: 0 },
  modulation: { modType: "off" },
  reverb: { reverb: 0 },
  delay: { delayType: "off" },
  saturation: { satMode: 0 },
  utility: { width: 1, phase: false },
  imager: { width: 1, imagerBalance: 0, imagerRotation: 0, imagerMono: 0 },
  smoothen: { smoothenOn: false },
  pitchCorrection: { pitchOn: false },
  deEsser: { deEssOn: false },
};

export function Studio() {
  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loop, setLoop] = useState(false);
  const [masterVol, setMasterVol] = useState(0);
  const [tab, setTab] = useState("PLUGINS");
  const [pluginView, setPluginView] = useState<"PLUGINS" | "PRESETS">("PLUGINS");
  const [showInserts, setShowInserts] = useState(false);
  const [showSends, setShowSends] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<InsertTarget | null>(null);
  const [editingInsert, setEditingInsert] = useState<(InsertTarget & { plugin: string }) | null>(
    null,
  );
  const [mixUndo, setMixUndo] = useState<MixUndo | null>(null);
  const [query, setQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showRouting, setShowRouting] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | undefined>();
  const [recordingPreview, setRecordingPreview] = useState<{ id: string; duration: number } | null>(
    null,
  );
  const [grid, setGrid] = useState<GridDivision>("1/4");
  const [key, setKey] = useState("C");
  const [bpm, setBpm] = useState(120);
  const [bpmInput, setBpmInput] = useState("120.00");
  const [timelineZoom, setTimelineZoom] = useState(100);
  const [mixerDetached, setMixerDetached] = useState(false);
  const [mixerSize, setMixerSize] = useState("50");
  const [mixerPosition, setMixerPosition] = useState({ x: 24, y: 96 });
  const [timelineSelection, setTimelineSelection] = useState<TimelineSelection | null>(null);
  const [billingUsage, setBillingUsage] = useState<BillingUsage | null>(null);
  const [projectName, setProjectName] = useState("Untitled Session");
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [transportLocked, setTransportLocked] = useState(false);
  const [recoveryProject, setRecoveryProject] = useState<KreativeProjectFile | null>(null);
  const sessionHydrated = useRef(false);
  const autosaveDisabled = useRef(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
  const [renameSurface, setRenameSurface] = useState<"workspace" | "mixer" | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const mixerDrag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const timelineDrag = useRef<{ start: number; current: number } | null>(null);
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = window.localStorage.getItem("kreative.settings.v1");
      if (saved) {
        return {
          inputId: "",
          echoCancel: false,
          noiseSuppress: false,
          ...(JSON.parse(saved) as Partial<Settings>),
        };
      }
    } catch {
      // Ignore invalid local preferences and use safe defaults.
    }
    return { inputId: "", echoCancel: false, noiseSuppress: false };
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const rec = useRef<Rec | null>(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const historyRef = useRef<{
    current: HistorySnapshot | null;
    undo: HistoryEntry[];
    redo: HistoryEntry[];
    applying: boolean;
    pendingDescription: string;
  }>({ current: null, undo: [], redo: [], applying: false, pendingDescription: "" });
  const settingsTheme = settings["theme"];

  useEffect(() => {
    if (settings.gridDivision) setGrid(settings.gridDivision);
    if (settings.timelineZoom) setTimelineZoom(settings.timelineZoom);
    if (settings.mixerSize) setMixerSize(settings.mixerSize);
    document.documentElement.dataset["theme"] = settingsTheme ?? "dark";
  }, [settings.gridDivision, settings.timelineZoom, settings.mixerSize, settingsTheme]);

  useEffect(() => {
    setTracks((current) =>
      current.map((track) => {
        if ((!track.delaySync && track.busRole !== "reverb") || (track.busRole !== "delay" && track.busRole !== "reverb")) return track;
        const quarterNote = 60 / bpm;
        const delayTime =
          track.delaySync === "dotted-eighth"
            ? quarterNote * 0.75
            : track.delaySync
              ? quarterNote * 0.5
              : track.fx.delayTime;
        const reverbPreDelay =
          track.busRole === "reverb"
            ? Math.max(0.005, Math.min(0.2, quarterNote * 0.125))
            : track.fx.reverbPreDelay;
        return Math.abs(track.fx.delayTime - delayTime) < 0.0001 &&
          Math.abs(track.fx.reverbPreDelay - reverbPreDelay) < 0.0001
          ? track
          : { ...track, fx: { ...track.fx, delayTime, reverbPreDelay } };
      }),
    );
  }, [bpm]);

  useEffect(() => {
    const pitchKey = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"].indexOf(
      key,
    );
    setTracks((current) =>
      current.map((track) => {
        const hasPitchCorrection = track.inserts.includes("KREATIVE Pitch") || track.fx.pitchOn;
        return hasPitchCorrection && track.fx.pitchKey !== pitchKey
          ? { ...track, fx: { ...track.fx, pitchKey: pitchKey as Fx["pitchKey"] } }
          : track;
      }),
    );
  }, [key]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!mixerDrag.current) return;
      setMixerPosition({
        x: Math.max(0, mixerDrag.current.startX + event.clientX - mixerDrag.current.x),
        y: Math.max(0, mixerDrag.current.startY + event.clientY - mixerDrag.current.y),
      });
    };
    const up = () => {
      mixerDrag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const length = Math.max(
    30,
    ...tracks.map((t) => t.start + t.buffer.duration),
    recordingPreview ? recordingPreview.duration : 0,
  );
  const sel = tracks.find((t) => t.id === selected) ?? null;
  const snapTime = useCallback(
    (time: number) => {
      if (grid === "free") return Math.max(0, time);
      const step = (60 / Math.max(20, Math.min(300, bpm))) * GRID_BEATS[grid];
      return Math.max(0, Math.round(time / step) * step);
    },
    [bpm, grid],
  );
  const timelineTime = useCallback(
    (clientX: number, element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return Math.max(
        0,
        Math.min(
          length,
          ((clientX - bounds.left + element.scrollLeft) / element.scrollWidth) * length,
        ),
      );
    },
    [length],
  );
  const editingTrack = editingInsert
    ? (tracks.find((t) => t.id === editingInsert.trackId) ?? null)
    : null;

  useEffect(() => {
    engine.update(tracks);
  }, [tracks]);
  useEffect(() => {
    const history = historyRef.current;
    const next = { tracks, masterVolume: masterVol };
    if (history.applying) {
      history.current = next;
      history.applying = false;
      return;
    }
    if (!history.current) {
      history.current = next;
      return;
    }
    if (history.current.tracks === tracks && history.current.masterVolume === masterVol) return;
    history.undo.push({
      ...history.current,
      description: history.pendingDescription || "Studio change",
    });
    history.current = next;
    history.redo = [];
    history.pendingDescription = "";
    if (history.undo.length > 100) history.undo.shift();
  }, [masterVol, tracks]);
  useEffect(() => {
    if (engine.ctx) engine.master.gain.value = masterVol <= -60 ? 0 : Math.pow(10, masterVol / 20);
  }, [masterVol, tracks.length]);

  const addBuffer = useCallback(
    (buffer: AudioBuffer, name: string, start = 0, base?: Partial<TrackState>) => {
      const id = crypto.randomUUID();
      engine.addTrack(id);
      const tr: TrackState = {
        id,
        name,
        kind: "audio",
        colorIdx: counter.current++ % COLORS.length,
        start,
        buffer,
        peaks: computePeaks(buffer),
        volume: 0,
        pan: 0,
        mute: false,
        solo: false,
        inserts: Array<string | null>(10).fill(null),
        pluginBypass: {},
        fx: defaultFx(),
        routing: defaultTrackRouting(),
        sendSlots: Array<BusSendSlot | null>(10).fill(null),
        ...base,
      };
      tr.id = id;
      tr.buffer = buffer;
      tr.peaks = computePeaks(buffer);
      tr.start = start;
      tr.name = name;
      setTracks((t) => [...t, tr]);
      setSelected(id);
      return tr;
    },
    [],
  );

  const addBus = useCallback(() => {
    const ctx = engine.ctx;
    if (!ctx) {
      toast("Add or record audio before creating a bus");
      return;
    }
    const buffer = ctx.createBuffer(2, 1, ctx.sampleRate);
    const bus = addBuffer(buffer, `Bus ${counter.current + 1}`, 0, {
      kind: "bus",
      peaks: [0],
      sendSlots: Array<BusSendSlot | null>(10).fill(null),
    });
    patch(bus.id, { volume: 0 });
    if (settings.showTips ?? true) toast.success(`${bus.name} created`);
  }, [addBuffer, settings.showTips]);

  const addEmptyTrack = useCallback(async () => {
    const ctx = await engine.init();
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const track = addBuffer(buffer, `Audio ${counter.current + 1}`);
    if (settings.showTips ?? true) toast.success(`${track.name} created`);
    return track;
  }, [addBuffer, settings.showTips]);

  const addFiles = useCallback(
    async (files: FileList | File[], targetId?: string) => {
      for (const file of Array.from(files)) {
        if (
          !file.type.startsWith("audio") &&
          !/\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i.test(file.name)
        ) {
          toast.error(`${file.name} isn't an audio file`);
          continue;
        }
        try {
          const buffer = await engine.decode(file);
          const target = targetId ? tracksRef.current.find((track) => track.id === targetId) : null;
          const tr = target
            ? (patch(target.id, {
                buffer,
                peaks: computePeaks(buffer),
                name: file.name.replace(/\.[^.]+$/, ""),
              }),
              { ...target, buffer, peaks: computePeaks(buffer) })
            : addBuffer(buffer, file.name.replace(/\.[^.]+$/, ""));
          if (target) {
            tracksRef.current = tracksRef.current.map((item) =>
              item.id === target.id
                ? {
                    ...item,
                    buffer,
                    peaks: computePeaks(buffer),
                    name: file.name.replace(/\.[^.]+$/, ""),
                  }
                : item,
            );
          }
          if (engine.playing) {
            void engine.play(
              target ? tracksRef.current : [...tracksRef.current, tr],
              engine.time(),
            );
          }
        } catch {
          toast.error(`Couldn't read ${file.name}`);
        }
      }
    },
    [addBuffer],
  );

  const loadProject = useCallback(
    async (project: KreativeProjectFile) => {
      const ctx = await engine.init();
      engine.stop();
      tracksRef.current.forEach((track) => engine.removeTrack(track.id));
      const idMap = new Map<string, string>();
      const created: Array<{ source: KreativeProjectFile["tracks"][number]; track: TrackState }> = [];
      for (const source of project.tracks) {
        const file = projectAudioFile(source);
        const buffer = file ? await engine.decode(file) : ctx.createBuffer(2, 1, ctx.sampleRate);
        const track = addBuffer(buffer, source.name, source.start, {
          kind: source.kind ?? "audio",
          ...(source.busRole ? { busRole: source.busRole } : {}),
          ...(source.returnOnly !== undefined ? { returnOnly: source.returnOnly } : {}),
          ...(source.delaySync ? { delaySync: source.delaySync } : {}),
          colorIdx: source.colorIdx,
          volume: source.volume,
          pan: source.pan,
          mute: source.mute,
          solo: source.solo,
          inserts: source.inserts,
          pluginBypass: source.pluginBypass,
          fx: source.fx,
          sendSlots: source.sendSlots ?? Array<BusSendSlot | null>(10).fill(null),
          ...(source.routing ? { routing: source.routing } : {}),
        });
        idMap.set(source.id, track.id);
        created.push({ source, track });
      }
      const restored = created.map(({ source, track }) => ({
        ...track,
        routing: source.routing
          ? {
              ...source.routing,
              outputBus:
                source.routing.outputBus === "master"
                  ? "master"
                  : (idMap.get(source.routing.outputBus) ?? "master"),
              sends: Object.fromEntries(
                Object.entries(source.routing.sends).flatMap(([id, level]) => {
                  const nextId = idMap.get(id);
                  return nextId ? [[nextId, level]] : [];
                }),
              ),
            }
          : defaultTrackRouting(),
        sendSlots: (source.sendSlots ?? Array<BusSendSlot | null>(10).fill(null)).map((slot) =>
          slot && idMap.has(slot.targetId) ? { ...slot, targetId: idMap.get(slot.targetId)! } : slot,
        ),
      }));
      tracksRef.current = restored;
      setTracks(restored);
      setMasterVol(project.masterVolume);
      if (project.key) setKey(project.key);
      if (project.bpm) {
        setBpm(project.bpm);
        setBpmInput(project.bpm.toFixed(2));
      }
      if (project.key || project.bpm) setTransportLocked(true);
      setProjectName(project.name);
      setSelected(restored[0]?.id ?? null);
      engine.update(restored);
      toast.success(`Loaded ${project.name}`);
    },
    [addBuffer],
  );

  const saveProjectFile = async () => {
    if (!tracksRef.current.length) {
      toast.error("Add audio before saving a project.");
      return;
    }
    downloadKreativeProject(
      await createKreativeProject(projectName, tracksRef.current, masterVol, key, bpm),
    );
    toast.success("Project file saved.");
  };

  const saveCloudProject = async () => {
    const token = localStorage.getItem("kreative.auth.token");
    if (!token) {
      toast.error("Sign in to save a cloud project.");
      return null;
    }
    const sessionData = await createKreativeProject(
      projectName,
      tracksRef.current,
      masterVol,
      key,
      bpm,
    );
    const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001";
    const response = await fetch(`${apiBase}/projects${cloudProjectId ? `/${cloudProjectId}` : ""}`, {
      method: cloudProjectId ? "PUT" : "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: projectName, sessionData }),
    });
    if (!response.ok) throw new Error("Unable to save the cloud project.");
    const data = (await response.json()) as { project?: { id?: string } };
    if (data.project?.id) setCloudProjectId(data.project.id);
    toast.success("Cloud project saved.");
    return data.project?.id ?? cloudProjectId;
  };

  const shareCloudProject = async () => {
    const savedProjectId = await saveCloudProject();
    if (!savedProjectId) return;
    const token = localStorage.getItem("kreative.auth.token");
    const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001";
    const response = await fetch(`${apiBase}/projects/${savedProjectId}/share`, {
      method: "POST",
      headers: { authorization: `Bearer ${token ?? ""}` },
    });
    if (!response.ok) throw new Error("Unable to create a share link.");
    const data = (await response.json()) as { shareToken: string };
    const link = `${window.location.origin}/?share=${encodeURIComponent(data.shareToken)}`;
    await navigator.clipboard.writeText(link);
    toast.success("Share link copied to clipboard.");
  };

  useEffect(() => {
    const shareToken = new URLSearchParams(window.location.search).get("share");
    if (!shareToken) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001";
    void fetch(`${apiBase}/shared/projects/${encodeURIComponent(shareToken)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("This shared project is unavailable.");
        return (await response.json()) as {
          project?: { id?: string; session_data?: KreativeProjectFile };
        };
      })
      .then(async (data) => {
        if (!data.project?.session_data) throw new Error("The shared project has no session data.");
        setCloudProjectId(data.project.id ?? null);
        await loadProject(data.project.session_data);
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Unable to open shared project."),
      );
  }, [loadProject]);

  useEffect(() => {
    const saved = sessionStorage.getItem("kreative.session.autosave");
    const cleanUnload = sessionStorage.getItem("kreative.session.clean-unload") === "true";
    sessionStorage.setItem("kreative.session.clean-unload", "false");
    if (!saved) {
      sessionHydrated.current = true;
      return;
    }
    try {
      const project = JSON.parse(saved) as KreativeProjectFile;
      if (cleanUnload) {
        void loadProject(project).finally(() => {
          sessionHydrated.current = true;
        });
      } else {
        setRecoveryProject(project);
      }
    } catch (error) {
      console.error("Couldn't read the studio recovery session.", error);
      sessionStorage.removeItem("kreative.session.autosave");
      sessionHydrated.current = true;
    }
  }, [loadProject]);

  useEffect(() => {
    const onUnload = () => sessionStorage.setItem("kreative.session.clean-unload", "true");
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  useEffect(() => {
    if (!sessionHydrated.current || !tracks.length || autosaveDisabled.current) return;
    const timer = window.setTimeout(() => {
      void createKreativeProject(projectName, tracks, masterVol, key, bpm)
        .then((project) => sessionStorage.setItem("kreative.session.autosave", JSON.stringify(project)))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "QuotaExceededError") {
            autosaveDisabled.current = true;
            sessionStorage.removeItem("kreative.session.autosave");
            toast("This session is too large for automatic recovery. Use Save to preserve the audio.");
            return;
          }
          console.error("Couldn't autosave the studio session.", error);
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [bpm, key, masterVol, projectName, tracks]);

  const markHistory = (description: string) => {
    historyRef.current.pendingDescription = description;
  };
  const patch = (id: string, p: Partial<TrackState>) => {
    markHistory("Track mix or routing change");
    setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  };
  const patchFx = (id: string, p: Partial<Fx>) => {
    markHistory("Plugin parameter change");
    setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, fx: { ...t.fx, ...p } } : t)));
  };
  const beginRename = (track: TrackState, surface: "workspace" | "mixer") => {
    setRenamingTrackId(track.id);
    setRenameSurface(surface);
    setRenameValue(track.name);
  };

  const refreshBillingUsage = useCallback(() => {
    const token = localStorage.getItem("kreative.auth.token");
    if (!token) {
      setBillingUsage(null);
      return;
    }
    void fetch(`${import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001"}/billing/account`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 404) return null;
        if (!response.ok) throw new Error("Unable to load billing usage.");
        return (await response.json()) as BillingUsage & { plan: BillingUsage["plan"] | null };
      })
      .then((usage) => setBillingUsage(usage?.plan ? usage : null))
      .catch(() => setBillingUsage(null));
  }, []);

  useEffect(() => {
    refreshBillingUsage();
    window.addEventListener("kreative:billing-updated", refreshBillingUsage);
    return () => window.removeEventListener("kreative:billing-updated", refreshBillingUsage);
  }, [refreshBillingUsage]);
  const cancelRename = () => {
    setRenamingTrackId(null);
    setRenameSurface(null);
  };
  const commitRename = () => {
    if (!renamingTrackId) return;
    const name = renameValue.trim();
    if (name) patch(renamingTrackId, { name });
    cancelRename();
  };

  const applyTemplate = (template: MixTemplate) => {
    if (!sel) {
      toast("Select an audio track before applying a template");
      return;
    }
    const isBeatName = (name: string) => /\b(beat|instrumental|music|two.?track)\b/i.test(name);
    const isVocalName = (name: string) => /\b(vocal|vox|voice|lead)\b/i.test(name);
    const supportRole = (name: string): "vocal-double" | "harmony" | "adlib" | null => {
      if (/\b(adlibs?|ad-libs?)\b/i.test(name)) return "adlib";
      if (/\b(double|doubles|dbl)\b/i.test(name)) return "vocal-double";
      if (/\b(harmon(y|ies)|bgv|background|backing vocal)\b/i.test(name)) return "harmony";
      return null;
    };
    const fullMix = template.category === "full-mix";
    const selectedIsSupport = supportRole(sel.name) !== null;
    const namedLead = tracksRef.current.find(
      (track) =>
        track.kind !== "bus" &&
        isVocalName(track.name) &&
        !isBeatName(track.name) &&
        supportRole(track.name) === null,
    );
    const vocalSource =
      fullMix && (sel.kind === "bus" || isBeatName(sel.name) || selectedIsSupport)
        ? (namedLead ??
          (sel.kind === "bus"
            ? tracksRef.current.find((track) => track.kind !== "bus")
            : undefined))
        : sel.kind === "bus" && template.category === "vocal"
          ? tracksRef.current.find((track) => track.kind !== "bus" && isVocalName(track.name))
          : sel;
    if (!vocalSource) {
      toast.error("Select or name a lead vocal track before applying a full-mix template.");
      return;
    }
    const chainTarget =
      template.category === "mastering"
        ? (tracksRef.current.find((track) => track.busRole === "master") ?? null)
        : vocalSource;
    if (
      chainTarget?.inserts.some(Boolean) &&
      !window.confirm(`Replace the existing chain on ${chainTarget.name} with ${template.name}?`)
    ) {
      return;
    }

    let nextTracks = [...tracksRef.current];
    const createdBusIds: string[] = [];
    const createBus = (busRole: NonNullable<TrackState["busRole"]>, name: string): TrackState => {
      const ctx = engine.ctx;
      if (!ctx) throw new Error("Start the audio engine before creating template buses.");
      const id = crypto.randomUUID();
      engine.addTrack(id);
      createdBusIds.push(id);
      return {
        id,
        name,
        kind: "bus",
        busRole,
        returnOnly: busRole === "reverb" || busRole === "delay",
        colorIdx: counter.current++ % COLORS.length,
        start: 0,
        buffer: ctx.createBuffer(2, 1, ctx.sampleRate),
        peaks: [0],
        volume: 0,
        pan: 0,
        mute: false,
        solo: false,
        inserts: Array<string | null>(10).fill(null),
        pluginBypass: {},
        fx: defaultFx(),
        routing: defaultTrackRouting(),
        sendSlots: Array<BusSendSlot | null>(10).fill(null),
      };
    };
    const ensureBus = (
      busRole: NonNullable<TrackState["busRole"]>,
      templateRole: "vocal-bus" | "reverb-bus" | "delay-bus" | "master",
      name: string,
    ) => {
      const existing = nextTracks.find((track) => track.busRole === busRole);
      const base = existing ?? createBus(busRole, name);
      const configured = {
        ...applyTemplateToTrack(base, template, templateRole),
        kind: "bus" as const,
        busRole,
        returnOnly: busRole === "reverb" || busRole === "delay",
      };
      if (existing) {
        nextTracks = nextTracks.map((track) => (track.id === existing.id ? configured : track));
      } else {
        nextTracks.push(configured);
      }
      return configured;
    };
    if (fullMix) {
      const ctx = engine.ctx;
      if (!ctx) {
        toast.error("Load or record audio before applying a full-mix template.");
        return;
      }
      const masterBus = ensureBus("master", "master", "Master Bus");
      const vocalBus = ensureBus("vocal", "vocal-bus", "Vocal Bus");
      const reverbBus = ensureBus("reverb", "reverb-bus", "Vocal Reverb");
      const delayBus = ensureBus("delay", "delay-bus", "Vocal Delay");
      const destinations = { "reverb-bus": reverbBus.id, "delay-bus": delayBus.id };
      const vocalDefinition = template.tracks.find((track) => track.role === "vocal-bus");
      const sendSlots: (BusSendSlot | null)[] = Array<BusSendSlot | null>(10).fill(null);
      const routingSends: Record<string, number> = {};
      for (const [index, send] of (vocalDefinition?.sends ?? []).entries()) {
        const targetId = destinations[send.targetRole];
        sendSlots[index] = { targetId, level: send.levelDb };
        routingSends[targetId] = send.levelDb;
      }
      const configuredVocalBus = {
        ...vocalBus,
        sendSlots,
        routing: { outputBus: masterBus.id, sends: routingSends },
      };
      const configuredReverbBus = {
        ...reverbBus,
        routing: defaultTrackRouting(),
      };
      const delayDefinition = template.tracks.find((track) => track.role === "delay-bus");
      const delaySync = delayDefinition?.tempoSync;
      const configuredDelayBus = {
        ...delayBus,
        ...(delaySync
          ? {
              delaySync,
              fx: {
                ...delayBus.fx,
                delayTime: (delaySync === "dotted-eighth" ? 45 : 30) / bpm,
              },
            }
          : {}),
        routing: defaultTrackRouting(),
      };
      const configuredMasterBus = {
        ...masterBus,
        routing: defaultTrackRouting(),
      };
      const configuredLead = {
        ...applyTemplateToTrack(vocalSource, template, "lead-vocal"),
        routing: { ...(vocalSource.routing ?? defaultTrackRouting()), outputBus: vocalBus.id },
      };
      const supportTracks = new Map<string, TrackState>();
      const supportPanCounts = new Map<string, number>();
      const audioTracks = nextTracks.filter((track) => track.kind !== "bus");
      for (const track of audioTracks) {
        if (track.id === vocalSource.id) continue;
        const role = supportRole(track.name) ?? (isVocalName(track.name) ? "harmony" : null);
        if (!role) continue;
        const panIndex = supportPanCounts.get(role) ?? 0;
        supportPanCounts.set(role, panIndex + 1);
        const defaultMix = TEMPLATE_MIX_DEFAULTS[role];
        const panDirection = panIndex % 2 === 0 ? 1 : -1;
        supportTracks.set(track.id, {
          ...applyTemplateToTrack(track, template, role),
          volume: defaultMix.volume,
          pan: defaultMix.pan * panDirection,
          routing: { ...(track.routing ?? defaultTrackRouting()), outputBus: vocalBus.id },
        });
      }
      const assignedSupport = new Set(supportTracks.keys());
      const unmatchedAudio = audioTracks.filter(
        (track) => track.id !== vocalSource.id && !assignedSupport.has(track.id),
      );
      const namedBeats = unmatchedAudio.filter((track) => isBeatName(track.name));
      const beatIds = new Set(
        (namedBeats.length ? namedBeats : unmatchedAudio.length === 1 ? unmatchedAudio : []).map(
          (track) => track.id,
        ),
      );
      const configuredTracks = nextTracks.map((track) => {
        if (track.id === vocalSource.id) return configuredLead;
        if (track.id === configuredVocalBus.id) return configuredVocalBus;
        if (track.id === configuredReverbBus.id) return configuredReverbBus;
        if (track.id === configuredDelayBus.id) return configuredDelayBus;
        if (track.id === configuredMasterBus.id) return configuredMasterBus;
        const support = supportTracks.get(track.id);
        if (support) return support;
        if (beatIds.has(track.id)) {
          return {
            ...applyTemplateToTrack(track, template, "beat"),
            routing: { ...(track.routing ?? defaultTrackRouting()), outputBus: masterBus.id },
          };
        }
        return {
          ...track,
          routing: { ...(track.routing ?? defaultTrackRouting()), outputBus: masterBus.id },
        };
      });
      const firstTrack = configuredTracks[0];
      if (
        firstTrack &&
        routingWouldCycle(
          configuredTracks,
          firstTrack.id,
          firstTrack.routing ?? defaultTrackRouting(),
        )
      ) {
        for (const id of createdBusIds) engine.removeTrack(id);
        toast.error("This template would create an audio feedback loop. Review your bus sends.");
        return;
      }
      nextTracks = configuredTracks;
      setSelected(configuredLead.id);
      toast.success(
        "Full-mix template applied with vocal, reverb, delay, beat, and master routing.",
      );
    } else if (template.category === "mastering") {
      if (!engine.ctx) {
        toast.error("Load or record audio before applying a mastering template.");
        return;
      }
      const masterBus = ensureBus("master", "master", "Master Bus");
      const masterId = masterBus.id;
      nextTracks = nextTracks.map((track) =>
        track.id === masterId
          ? { ...masterBus, routing: defaultTrackRouting() }
          : {
              ...track,
              routing: { ...(track.routing ?? defaultTrackRouting()), outputBus: masterId },
            },
      );
      const firstTrack = nextTracks[0];
      if (
        firstTrack &&
        routingWouldCycle(nextTracks, firstTrack.id, firstTrack.routing ?? defaultTrackRouting())
      ) {
        for (const id of createdBusIds) engine.removeTrack(id);
        toast.error("This master routing would create an audio feedback loop.");
        return;
      }
      setSelected(masterId);
      toast.success("Mastering chain applied to the dedicated master bus.");
    } else {
      const target =
        template.id === "vocal-bus-glue" && vocalSource.kind === "bus" ? vocalSource : sel;
      const configured = applyTemplateToTrack(target, template);
      nextTracks = nextTracks.map((track) => (track.id === target.id ? configured : track));
    }

    setTracks(nextTracks);
    tracksRef.current = nextTracks;
    if (!fullMix && template.category !== "mastering") setSelected(vocalSource.id);
    setShowTemplates(false);
    if (!fullMix && template.category !== "mastering") {
      toast.success(`${template.name} applied to ${vocalSource.name}`);
    }
  };
  const remove = (id: string) => {
    const track = tracksRef.current.find((item) => item.id === id);
    if (
      (settings.confirmDestructive ?? true) &&
      track &&
      !window.confirm(`Remove ${track.name}?`)
    ) {
      return;
    }
    engine.removeTrack(id);
    setTracks((ts) => ts.filter((t) => t.id !== id));
    if (selected === id) setSelected(null);
  };

  const togglePlay = async () => {
    if (recording) {
      stopRecording();
      return;
    }
    if (!tracks.length) {
      toast("Add or record audio first");
      return;
    }
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
    } else {
      await engine.play(tracks, loop && timelineSelection ? timelineSelection.start : undefined);
      setPlaying(true);
    }
  };

  const exportAudio = async (
    options: ExportOptions,
    onProgress: (percent: number, message: string) => void,
  ) => {
    const exportTracks = tracksRef.current;
    if (!engine.ctx || !exportTracks.length) {
      throw new Error("Load or record audio before exporting.");
    }
    if (recording) throw new Error("Stop the microphone recording before exporting.");
    const token = localStorage.getItem("kreative.auth.token");
    if (token) {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001"}/billing/consume`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Unable to reserve a mix and master session.");
      }
      const usage = (await response.json()) as { plan: BillingUsage["plan"]; sessionsRemaining: number };
      setBillingUsage((current) =>
        current
          ? { ...current, plan: usage.plan, sessionsRemaining: usage.sessionsRemaining }
          : { plan: usage.plan, sessionsRemaining: usage.sessionsRemaining, sessionsLimit: usage.plan === "K-PRO" ? 6 : 3 },
      );
    }

    const wasPlaying = engine.playing;
    const resumeAt = engine.time();
    if (wasPlaying) {
      engine.stop();
      setPlaying(false);
    }
    const baseName = safeFileName(options.name);

    try {
      if (options.format === "zip") {
        const stems = audioTracks(exportTracks);
        const files = [];
        for (let index = 0; index < stems.length; index++) {
          const stem = stems[index]!;
          engine.update(tracksForStem(exportTracks, stem.id));
          const audio = await captureMix(
            tracksForStem(exportTracks, stem.id),
            options.start,
            options.end,
            (fraction) =>
              onProgress(
                ((index + fraction) / stems.length) * 88,
                `Rendering stem ${index + 1} of ${stems.length}: ${stem.name}`,
              ),
          );
          files.push({
            name: `${String(index + 1).padStart(2, "0")} - ${safeFileName(stem.name)}.wav`,
            blob: encodeWav(audio, options.bitDepth),
          });
        }
        onProgress(92, "Creating ZIP archive...");
        const zip = await createZip(files);
        onProgress(98, "Saving ZIP archive...");
        downloadExport(zip, `${baseName} - Stems.zip`);
      } else {
        engine.update(exportTracks);
        const audio = await captureMix(exportTracks, options.start, options.end, (fraction) =>
          onProgress(fraction * 90, "Recording processed mix..."),
        );
        onProgress(94, "Encoding audio...");
        const blob =
          options.format === "mp3"
            ? encodeMp3(audio, options.bitrate)
            : encodeWav(audio, options.bitDepth);
        onProgress(98, "Saving file...");
        downloadExport(blob, `${baseName}.${options.format}`);
      }
    } finally {
      engine.stop();
      engine.update(exportTracks);
      engine.seek(resumeAt, exportTracks);
      if (wasPlaying) {
        await engine.play(exportTracks, resumeAt);
        setPlaying(true);
      }
    }
  };

  const downloadExport = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const stop = () => {
    if (recording) stopRecording();
    engine.stop();
    setPlaying(false);
  };
  const seek = (t: number) => {
    if (!recording) engine.seek(Math.max(0, Math.min(length, t)), tracks);
  };
  const onEnd = () => {
    if (recording) return;
    if (loop) void engine.play(tracks, timelineSelection?.start ?? 0);
    else stop();
  };

  const startRecording = async () => {
    if (recording) return;
    let target = sel;
    if (!target || target.kind === "bus") {
      target = await addEmptyTrack();
    }
    if (!target) return;
    try {
      await engine.init();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(settings.inputId ? { deviceId: { exact: settings.inputId } } : {}),
          echoCancellation: settings.echoCancel,
          noiseSuppression: settings.noiseSuppress,
          autoGainControl: settings.autoGainControl ?? false,
        },
      });
      const input = engine.ctx!.createMediaStreamSource(stream);
      const analyser = engine.ctx!.createAnalyser();
      analyser.fftSize = 1024;
      input.connect(analyser);
      const mr = new MediaRecorder(stream);
      const r: Rec = {
        mr,
        chunks: [],
        start: engine.time(),
        stream,
        trackId: target.id,
        analyser,
        meterTimer: 0,
      };
      const meter = new Float32Array(analyser.fftSize);
      const updateWaveform = () => {
        analyser.getFloatTimeDomainData(meter);
        const peak = meter.reduce((highest, sample) => Math.max(highest, Math.abs(sample)), 0);
        const track = tracksRef.current.find((item) => item.id === r.trackId);
        if (track) {
          const livePeaks = [...track.peaks, Math.max(0.02, peak)].slice(-240);
          patch(r.trackId, { peaks: livePeaks });
          setRecordingPreview({
            id: r.trackId,
            duration: Math.max(0.1, r.start + Math.max(0, engine.time() - r.start)),
          });
        }
        r.meterTimer = window.requestAnimationFrame(updateWaveform);
      };
      updateWaveform();
      mr.ondataavailable = (e) => {
        if (e.data.size) r.chunks.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        window.cancelAnimationFrame(r.meterTimer);
        setRecordingPreview(null);
        input.disconnect();
        analyser.disconnect();
        try {
          const buffer = await engine.decode(new Blob(r.chunks, { type: mr.mimeType }));
          patch(r.trackId, {
            buffer,
            peaks: computePeaks(buffer),
            start: r.start,
            name: target.name.replace(/^Audio /, "Recording "),
          });
          tracksRef.current = tracksRef.current.map((item) =>
            item.id === r.trackId
              ? {
                  ...item,
                  buffer,
                  peaks: computePeaks(buffer),
                  start: r.start,
                  name: target!.name.replace(/^Audio /, "Recording "),
                }
              : item,
          );
          toast.success("Recording captured on the selected track");
        } catch {
          toast.error("Couldn't process the recording");
        }
      };
      rec.current = r;
      mr.start();
      await engine.play(tracksRef.current, r.start);
      setPlaying(true);
      setRecording(true);
    } catch {
      toast.error("Microphone access was blocked. Allow it in your browser to record.");
    }
  };
  const stopRecording = () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    r.mr.stop();
    engine.pause();
    setPlaying(false);
    setRecording(false);
  };

  const split = () => {
    if (!sel || !engine.ctx) {
      toast("Select a track first");
      return;
    }
    const t = snapTime(engine.time() - sel.start);
    if (t <= 0.05 || t >= sel.buffer.duration - 0.05) {
      toast("Move the playhead inside the selected track to split it");
      return;
    }
    const cut = Math.floor(t * sel.buffer.sampleRate);
    const a = sliceBuffer(engine.ctx, sel.buffer, 0, cut);
    const b = sliceBuffer(engine.ctx, sel.buffer, cut, sel.buffer.length);
    patch(sel.id, { buffer: a, peaks: computePeaks(a) });
    const nb = addBuffer(b, `${sel.name} (2)`, sel.start + t, {
      volume: sel.volume,
      pan: sel.pan,
      inserts: [...sel.inserts],
      fx: { ...sel.fx },
      colorIdx: sel.colorIdx,
    });
    if (engine.playing) {
      const next = tracksRef.current.map((x) => (x.id === sel.id ? { ...x, buffer: a } : x));
      void engine.play([...next, nb], engine.time());
    }
    toast.success(`Split ${sel.name}`);
  };

  const cutSelection = () => {
    if (!sel || !engine.ctx || !timelineSelection) {
      toast("Drag across the timeline to select audio before cutting");
      return;
    }
    const from = Math.max(0, timelineSelection.start - sel.start);
    const to = Math.min(sel.buffer.duration, timelineSelection.end - sel.start);
    if (to - from <= 0.05) {
      toast("Select a larger section of the selected track");
      return;
    }
    const fromSample = Math.floor(from * sel.buffer.sampleRate);
    const toSample = Math.ceil(to * sel.buffer.sampleRate);
    const nextBuffer = engine.ctx.createBuffer(
      sel.buffer.numberOfChannels,
      sel.buffer.length,
      sel.buffer.sampleRate,
    );
    for (let channel = 0; channel < nextBuffer.numberOfChannels; channel += 1) {
      const samples = nextBuffer.getChannelData(channel);
      samples.set(sel.buffer.getChannelData(channel));
      samples.fill(0, fromSample, toSample);
    }
    patch(sel.id, { buffer: nextBuffer, peaks: computePeaks(nextBuffer) });
    setSelected(sel.id);
    setTimelineSelection(null);
    toast.success(`Cut ${fmtTick(to - from)} from ${sel.name}; gap preserved`);
  };

  const moveClip = (sourceId: string, targetId: string, clientX: number, element: HTMLElement) => {
    if (sourceId === targetId) return;
    const source = tracksRef.current.find((track) => track.id === sourceId);
    const target = tracksRef.current.find((track) => track.id === targetId);
    if (!source || !target || target.kind === "bus") return;
    const rect = element.getBoundingClientRect();
    const start = snapTime(((clientX - rect.left) / rect.width) * length);
    const ctx = engine.ctx;
    if (!ctx) return;
    const empty = ctx.createBuffer(1, 1, ctx.sampleRate);
    const targetStart = target.start;
    const joinedStart = Math.min(targetStart, start);
    const targetOffset = Math.max(0, Math.round((targetStart - joinedStart) * ctx.sampleRate));
    const sourceOffset = Math.max(0, Math.round((start - joinedStart) * ctx.sampleRate));
    const joinedLength = Math.max(
      targetOffset + target.buffer.length,
      sourceOffset + source.buffer.length,
      1,
    );
    const joined = ctx.createBuffer(
      Math.max(target.buffer.numberOfChannels, source.buffer.numberOfChannels),
      joinedLength,
      ctx.sampleRate,
    );
    for (let channel = 0; channel < joined.numberOfChannels; channel += 1) {
      const output = joined.getChannelData(channel);
      const targetInput = target.buffer.getChannelData(
        Math.min(channel, target.buffer.numberOfChannels - 1),
      );
      const sourceInput = source.buffer.getChannelData(
        Math.min(channel, source.buffer.numberOfChannels - 1),
      );
      for (let index = 0; index < targetInput.length; index += 1) {
        output[targetOffset + index] = targetInput[index] ?? 0;
      }
      for (let index = 0; index < sourceInput.length; index += 1) {
        const destination = sourceOffset + index;
        output[destination] = Math.max(
          -1,
          Math.min(1, (output[destination] ?? 0) + (sourceInput[index] ?? 0)),
        );
      }
    }
    const targetContent = {
      buffer: joined,
      peaks: computePeaks(joined),
      start: joinedStart,
    };
    const sourceContent = {
      buffer: empty,
      peaks: [0],
      start: 0,
    };
    const next = tracksRef.current.map((track) => {
      if (track.id === source.id) return { ...track, ...sourceContent };
      if (track.id === target.id) return { ...track, ...targetContent };
      return track;
    });
    tracksRef.current = next;
    setTracks(next);
    setSelected(target.id);
    toast.success(`${source.name} joined ${target.name}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const modifier = e.ctrlKey || e.metaKey;
      if (modifier && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoHistory();
        else undoHistory();
        return;
      }
      if (modifier && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoHistory();
        return;
      }
      if (modifier && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setRightPanelCollapsed((collapsed) => !collapsed);
        return;
      }
      if (modifier && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setMixerDetached((detached) => !detached);
        return;
      }
      if (modifier && e.key.toLowerCase() === "b") {
        e.preventDefault();
        cutSelection();
        return;
      }
      if (e.key === "Escape") {
        if (editingInsert) setEditingInsert(null);
        else if (pickerTarget) setPickerTarget(null);
        else if (showRouting) setShowRouting(null);
        else if (showExport) setShowExport(false);
        else if (showTemplates) setShowTemplates(false);
        else if (showSettings) setShowSettings(false);
        else if (showSends) setShowSends(false);
        else if (showInserts) setShowInserts(false);
        else if (!rightPanelCollapsed) setRightPanelCollapsed(true);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
      } else if (e.key === "r" || e.key === "R") {
        if (recording) stopRecording();
        else void startRecording();
      } else if (e.key === "s" || e.key === "S") split();
      else if (e.key === "Home") seek(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const insertPlugin = (name: string, target: InsertTarget) => {
    const track = tracks.find((item) => item.id === target.trackId);
    const family = getPluginFamily(name);
    const settings = getPluginSettings(name);
    if (!track || !family || !settings) {
      toast.error(`Couldn't load ${name}`);
      return;
    }
    const duplicate = track.inserts.findIndex(
      (plugin, slot) => slot !== target.slot && plugin && getPluginFamily(plugin) === family,
    );
    if (duplicate >= 0) {
      toast.error(`This track already uses the ${family} processor in insert ${duplicate + 1}`);
      return;
    }
    const previousPlugin = track.inserts[target.slot];
    const previousFamily = previousPlugin ? getPluginFamily(previousPlugin) : undefined;
    const inserts = [...track.inserts];
    inserts[target.slot] = name;
    if (previousFamily && previousFamily !== family) {
      const disablePrevious = PLUGIN_DISABLE_SETTINGS[previousFamily];
      if (disablePrevious) patchFx(track.id, disablePrevious);
    }
    patchFx(track.id, settings);
    patch(track.id, { inserts });
    setPickerTarget(null);
    setEditingInsert({ ...target, plugin: name });
    setSelected(track.id);
  };

  const applyPlugin = (name: string) => {
    if (!sel) {
      toast("Select a track first");
      return;
    }
    const family = getPluginFamily(name);
    const existingSlot = sel.inserts.findIndex(
      (plugin) => plugin && getPluginFamily(plugin) === family,
    );
    if (existingSlot >= 0) {
      insertPlugin(name, { trackId: sel.id, slot: existingSlot });
      return;
    }
    const slot = sel.inserts.findIndex((plugin) => plugin === null);
    if (slot < 0) {
      toast.error(`All insert slots on ${sel.name} are full`);
      return;
    }
    insertPlugin(name, { trackId: sel.id, slot });
  };

  const removePlugin = (target: InsertTarget, name: string) => {
    const track = tracks.find((item) => item.id === target.trackId);
    if (!track) return;
    const family = getPluginFamily(name);
    const disable = family ? PLUGIN_DISABLE_SETTINGS[family] : undefined;
    if (disable) patchFx(track.id, disable);
    const inserts = [...track.inserts];
    inserts[target.slot] = null;
    patch(track.id, { inserts });
    setEditingInsert(null);
  };

  const applyAiActions = async (
    actions: AiMixAction[],
    onProgress: (index: number, label: string) => void,
  ) => {
    if (!actions.length) return;
    const originalTracks = tracksRef.current;
    validateAiMixActions(actions, originalTracks);
    setMixUndo({ tracks: originalTracks, masterVolume: masterVol });
    const previewDuration = Math.min(
      3,
      Math.max(0.5, ...originalTracks.map((track) => track.start + track.buffer.duration)),
    );
    const originalPreview = engine.ctx
      ? await captureMix(originalTracks, 0, previewDuration, () => undefined)
      : null;
    let currentTracks = [...originalTracks];
    for (const [index, action] of actions.entries()) {
      if (action.type === "setMaster") {
        setMasterVol(action.volume);
        onProgress(index, `Master level → ${action.volume.toFixed(1)} dB`);
      } else {
        const trackIndex = currentTracks.findIndex((track) => track.id === action.trackId);
        if (trackIndex < 0) throw new Error(`AI change references missing track ${action.trackId}`);
        const target = currentTracks[trackIndex]!;
        let updated: TrackState;
        if (action.type === "setFx") {
          updated = { ...target, fx: { ...target.fx, ...action.patch } };
          onProgress(index, describeAiAction(action, target.name));
        } else if (action.type === "setTrackMix") {
          updated = {
            ...target,
            ...(action.volume === undefined ? {} : { volume: action.volume }),
            ...(action.pan === undefined ? {} : { pan: action.pan }),
          };
          onProgress(index, describeAiAction(action, target.name));
        } else {
          const family = getPluginFamily(action.plugin);
          const pluginSettings = getPluginSettings(action.plugin);
          if (!family || !pluginSettings) {
            throw new Error(`AI selected unsupported plugin ${action.plugin}`);
          }
          const duplicate = target.inserts.findIndex(
            (plugin, slot) => slot !== action.slot && plugin && getPluginFamily(plugin) === family,
          );
          if (duplicate >= 0) {
            throw new Error(
              `${target.name} already has the ${family} block in insert ${duplicate + 1}`,
            );
          }
          const previous = target.inserts[action.slot];
          const previousFamily = previous ? getPluginFamily(previous) : undefined;
          const fx = {
            ...target.fx,
            ...(previousFamily && previousFamily !== family
              ? (PLUGIN_DISABLE_SETTINGS[previousFamily] ?? {})
              : {}),
            ...pluginSettings,
          };
          const inserts = [...target.inserts];
          inserts[action.slot] = action.plugin;
          updated = { ...target, fx, inserts };
          onProgress(index, describeAiAction(action, target.name));
        }
        currentTracks = currentTracks.map((track, currentIndex) =>
          currentIndex === trackIndex ? updated : track,
        );
        tracksRef.current = currentTracks;
        setTracks(currentTracks);
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 160));
    }
    if (originalPreview && engine.ctx) {
      engine.update(currentTracks);
      const processedPreview = await captureMix(currentTracks, 0, previewDuration, () => undefined);
      const comparison = compareRenderedAudio(originalPreview, processedPreview);
      if (comparison.shouldRevert) {
        tracksRef.current = originalTracks;
        setTracks(originalTracks);
        setMixUndo(null);
        engine.update(originalTracks);
        throw new Error(`AI mix was reverted: ${comparison.reasons.join("; ")}`);
      }
      onProgress(actions.length, `Preview passed: ${comparison.rmsDeltaDb.toFixed(1)} dB RMS change`);
    }
  };

  const undoAiActions = () => {
    if (!mixUndo) return;
    tracksRef.current = mixUndo.tracks;
    setTracks(mixUndo.tracks);
    setMasterVol(mixUndo.masterVolume);
    setMixUndo(null);
    setEditingInsert(null);
    toast.success("Undid the last assistant mix plan");
  };

  const undoHistory = () => {
    const history = historyRef.current;
    const target = history.undo.pop();
    if (!target || !history.current) return;
    history.redo.push({
      ...history.current,
      description: target.description,
    });
    history.applying = true;
    history.current = target;
    tracksRef.current = target.tracks;
    setTracks(target.tracks);
    setMasterVol(target.masterVolume);
    setEditingInsert(null);
  };

  const redoHistory = () => {
    const history = historyRef.current;
    const target = history.redo.pop();
    if (!target || !history.current) return;
    history.undo.push({
      ...history.current,
      description: target.description,
    });
    history.applying = true;
    history.current = target;
    tracksRef.current = target.tracks;
    setTracks(target.tracks);
    setMasterVol(target.masterVolume);
    setEditingInsert(null);
  };

  const undoDescription = historyRef.current.undo.at(-1)?.description ?? "Nothing to undo";
  const redoDescription = historyRef.current.redo.at(-1)?.description ?? "Nothing to redo";

  const ticks = Array.from({ length: 10 }, (_, i) => (length / 10) * i);
  const fmtTick = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div
      className="h-dvh w-full overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void addFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files, uploadTarget);
          setUploadTarget(undefined);
          e.target.value = "";
        }}
      />
      <input
        ref={projectFileRef}
        type="file"
        accept=".kreative,application/vnd.kreative.session+json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void readKreativeProject(file).then(loadProject).catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : "Unable to open project file."),
            );
          }
          event.target.value = "";
        }}
      />
      <div className="relative flex h-full min-h-0 min-w-0 flex-col">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-panel px-2 py-1">
          <Logo />
          <div className="ml-1 flex shrink-0 gap-1">
            <button className="daw-btn h-8 w-8 text-primary" title="Select">
              <MousePointer2 className="h-4 w-4" />
            </button>
            <button
              className="daw-btn h-8 w-8"
              title="Add audio"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
            </button>
            <button
              className="daw-btn h-8 w-8"
              title="Split selected track at playhead (S)"
              onClick={split}
            >
              <Scissors className="h-4 w-4" />
            </button>
            <button
              className="daw-btn h-8 w-8"
              title="Open Kreative project"
              onClick={() => projectFileRef.current?.click()}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
            <button
              className="daw-btn h-8 w-8"
              title="Save Kreative project"
              onClick={() =>
                void saveProjectFile().catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Unable to save project."),
                )
              }
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              className="daw-btn h-8 w-8"
              title="Share cloud project"
              onClick={() =>
                void shareCloudProject().catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Unable to share project."),
                )
              }
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded border bg-background px-2 py-1">
            <Clock
              length={recording ? 1e9 : loop && timelineSelection ? timelineSelection.end : length}
              loop={loop}
              onEnd={onEnd}
            />
            <div className="font-mono text-[9px] text-muted-foreground">
              Length
              <br />
              <span className="text-lcd">{fmtTick(length)}</span>
            </div>
          </div>
          <label className="flex h-8 shrink-0 items-center gap-1 rounded border bg-background px-2 text-[9px] text-muted-foreground">
            KEY
            <select
              className="daw-select bg-transparent text-[10px] text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60"
              value={key}
              disabled={transportLocked}
              onChange={(event) => {
                setKey(event.target.value);
                setTransportLocked(true);
              }}
            >
              {["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"].map((note) => (
                <option value={note} key={note}>
                  {note}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-8 shrink-0 items-center gap-1 rounded border bg-background px-2 text-[9px] text-muted-foreground">
            BPM
            <input
              className="w-12 bg-transparent text-center font-mono text-[10px] text-lcd outline-none disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Tempo in BPM"
              title="Edit tempo in BPM"
              type="number"
              disabled={transportLocked}
              min={20}
              max={300}
              step={0.01}
              value={bpmInput}
              onChange={(event) => setBpmInput(event.target.value)}
              onBlur={() => {
                const parsed = Number(bpmInput);
                if (!bpmInput.trim() || !Number.isFinite(parsed)) {
                  setBpmInput(bpm.toFixed(2));
                  return;
                }
                const next = Math.max(20, Math.min(300, parsed));
                setBpm(next);
                setBpmInput(next.toFixed(2));
                setTransportLocked(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setBpmInput(bpm.toFixed(2));
              }}
            />
          </label>
          <button
            className={`daw-btn h-8 w-8 ${transportLocked ? "text-primary" : ""}`}
            title={transportLocked ? "Unlock key and BPM" : "Lock key and BPM"}
            aria-label={transportLocked ? "Unlock key and BPM" : "Lock key and BPM"}
            aria-pressed={transportLocked}
            onClick={() => setTransportLocked((locked) => !locked)}
          >
            {transportLocked ? <LockKeyhole className="h-3.5 w-3.5" /> : <UnlockKeyhole className="h-3.5 w-3.5" />}
          </button>
          <div className="flex shrink-0 gap-1">
            <button className="daw-btn h-8 w-8" title="Go to start" onClick={() => seek(0)}>
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              className="daw-btn h-8 w-8 text-lcd"
              title="Play / Pause (Space)"
              onClick={() => void togglePlay()}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button className="daw-btn h-8 w-8" title="Stop" onClick={stop}>
              <Square className="h-3.5 w-3.5" />
            </button>
            <button
              className={`daw-btn h-8 w-9 text-record ${recording ? "animate-pulse bg-record/20" : ""}`}
              title="Record from microphone (R)"
              onClick={() => (recording ? stopRecording() : void startRecording())}
            >
              <Circle className="h-3.5 w-3.5 fill-current" />
            </button>
            <button
              className="daw-btn h-8 w-8"
              title="Skip 10s"
              onClick={() => seek(engine.time() + 10)}
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              className={`daw-btn h-8 w-9 ${loop ? "text-primary" : ""}`}
              title={timelineSelection ? "Loop selected range" : "Loop project"}
              aria-label={timelineSelection ? "Loop selected range" : "Loop project"}
              aria-pressed={loop}
              onClick={() => setLoop(!loop)}
            >
              <Repeat className="h-4 w-4" />
            </button>
          </div>
          <div className="flex h-8 w-20 shrink-0 flex-col justify-center gap-1 rounded border bg-background px-2">
            <Meter horizontal />
            <Meter horizontal />
          </div>
          <label className="flex h-8 shrink-0 items-center gap-2 rounded border bg-background px-2 text-[9px] text-muted-foreground">
            GRID
            <select
              aria-label="Grid division"
              className="daw-select bg-transparent text-[10px] text-foreground outline-none"
              value={grid}
              onChange={(event) => setGrid(event.target.value as GridDivision)}
            >
              <option value="free">Free</option>
              <option value="1/2">1/2</option>
              <option value="1/4">1/4</option>
              <option value="1/8">1/8</option>
              <option value="1/16">1/16</option>
              <option value="1/32">1/32</option>
            </select>
          </label>
          <div className="flex h-8 shrink-0 items-center gap-1 rounded border bg-background px-1">
            <button
              className="daw-btn h-6 w-6 disabled:cursor-not-allowed disabled:opacity-35"
              title={`Undo: ${undoDescription}`}
              aria-label={`Undo: ${undoDescription}`}
              disabled={historyRef.current.undo.length === 0}
              onClick={undoHistory}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              className="daw-btn h-6 w-6 disabled:cursor-not-allowed disabled:opacity-35"
              title={`Redo: ${redoDescription}`}
              aria-label={`Redo: ${redoDescription}`}
              disabled={historyRef.current.redo.length === 0}
              onClick={redoHistory}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button
              className="daw-btn h-6 w-6"
              title="Zoom out timeline"
              onClick={() => setTimelineZoom((value) => Math.max(25, value - 25))}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-center font-mono text-[10px] text-lcd">{timelineZoom}%</span>
            <button
              className="daw-btn h-6 w-6"
              title="Zoom in timeline"
              onClick={() => setTimelineZoom((value) => Math.min(400, value + 25))}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              className="daw-btn h-8 w-8"
              title="Export mix or stems"
              aria-label="Export mix or stems"
              onClick={() => setShowExport(true)}
              disabled={!tracks.length || recording}
            >
              <Download className="h-4 w-4" />
            </button>
            <div className="hidden rounded border bg-background px-3 py-1.5 text-muted-foreground 2xl:block">
              Project: <span className="text-foreground">{projectName}</span>
            </div>
            <button
              className="daw-btn h-8 w-8"
              title="Template library"
              onClick={() => setShowTemplates(true)}
            >
              <WandSparkles className="h-4 w-4" />
            </button>
            <button
              className="daw-btn h-8 w-8"
              title="Settings"
              onClick={() => setShowSettings(true)}
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
            <AccountMenu />
          </div>
        </header>

        {billingUsage && billingUsage.sessionsRemaining <= 2 && (
          <div className="flex h-8 shrink-0 items-center justify-center border-b border-amber-400/30 bg-amber-400/10 px-3 text-[11px] text-amber-100">
            You have {billingUsage.sessionsRemaining} mix and master session
            {billingUsage.sessionsRemaining === 1 ? "" : "s"} remaining this month.
          </div>
        )}
        {recoveryProject && (
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-3 text-xs">
            <span>
              The studio found an unsaved session from an unexpected close. Reopen{" "}
              <strong>{recoveryProject.name}</strong>?
            </span>
            <div className="flex shrink-0 gap-2">
              <button
                className="rounded bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
                onClick={() => {
                  void loadProject(recoveryProject).finally(() => {
                    sessionHydrated.current = true;
                    setRecoveryProject(null);
                  });
                }}
              >
                Reopen session
              </button>
              <button
                className="rounded border px-3 py-1.5"
                onClick={() => {
                  sessionStorage.removeItem("kreative.session.autosave");
                  sessionHydrated.current = true;
                  setRecoveryProject(null);
                }}
              >
                Discard
              </button>
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 overflow-y-auto">
              <div className="w-72 shrink-0 border-r bg-panel">
                <div className="sticky top-0 z-20 flex h-20 flex-col justify-center gap-1 border-b bg-panel px-2 py-1 text-[10px] tracking-wider text-muted-foreground">
                  <div className="flex justify-end gap-1">
                    <button
                      aria-pressed={showInserts}
                      onClick={() => setShowInserts((visible) => !visible)}
                      className={`daw-btn h-6 px-2 text-[9px] ${showInserts ? "text-primary" : ""}`}
                      title={showInserts ? "Hide plugin inserts" : "Show plugin inserts"}
                    >
                      {showInserts ? "HIDE INSERTS" : "SHOW INSERTS"}
                    </button>
                    <button
                      aria-pressed={showSends}
                      onClick={() => setShowSends((visible) => !visible)}
                      className={`daw-btn h-6 px-2 text-[9px] ${showSends ? "text-primary" : ""}`}
                      title={showSends ? "Hide bus and send slots" : "Show bus and send slots"}
                    >
                      {showSends ? "HIDE SENDS" : "SHOW SENDS"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>TRACKS</span>
                    <div className="flex gap-1">
                    <button
                      className="daw-btn h-6 px-2 text-[10px]"
                      onClick={() => {
                        setUploadTarget(undefined);
                        void addEmptyTrack();
                      }}
                    >
                      + Audio
                    </button>
                    <button className="daw-btn h-6 px-2 text-[10px]" onClick={addBus}>
                      + Bus
                    </button>
                    </div>
                  </div>
                </div>
                {tracks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void addFiles(event.dataTransfer.files, t.id);
                    }}
                    className={`flex cursor-pointer flex-col border-b ${
                      showInserts || (showSends && t.kind !== "bus") ? "min-h-14" : "h-14"
                    } ${selected === t.id ? "bg-accent" : ""}`}
                  >
                    <div className="flex h-14 shrink-0 items-center">
                      <div className={`h-full w-1.5 ${COLORS[t.colorIdx]!.bg}`} />
                      {renamingTrackId === t.id && renameSurface === "workspace" ? (
                        <input
                          autoFocus
                          className="min-w-0 flex-1 rounded border bg-background px-1 text-xs outline-none"
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRename();
                            if (event.key === "Escape") cancelRename();
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="flex-1 truncate px-2"
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            beginRename(t, "workspace");
                          }}
                        >
                          {t.name}
                        </span>
                      )}
                      {renamingTrackId !== t.id && (
                        <button
                          className="mr-1 grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                          title={`Rename ${t.name}`}
                          aria-label={`Rename ${t.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            beginRename(t, "workspace");
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {t.kind !== "bus" && (
                        <button
                          className="mr-1 grid h-5 w-5 place-items-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                          title={`Upload audio to ${t.name}`}
                          aria-label={`Upload audio to ${t.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setUploadTarget(t.id);
                            fileRef.current?.click();
                          }}
                        >
                          <Upload className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          patch(t.id, { mute: !t.mute });
                        }}
                        className={`mr-1 h-5 w-5 rounded-sm text-[9px] ${t.mute ? "bg-meter-mid text-background" : "text-muted-foreground hover:bg-secondary"}`}
                      >
                        M
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          patch(t.id, { solo: !t.solo });
                        }}
                        className={`mr-1 h-5 w-5 rounded-sm text-[9px] ${t.solo ? "bg-meter-low text-background" : "text-muted-foreground hover:bg-secondary"}`}
                      >
                        S
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(t.id);
                        }}
                        title="Remove track"
                        className="mr-1 grid h-5 w-5 place-items-center rounded-sm text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {(showInserts || (showSends && t.kind !== "bus")) && (
                      <div className="flex shrink-0 items-start gap-1 overflow-x-auto border-t border-primary/20 bg-background/30 p-1">
                        <PluginSlots
                          track={t}
                          visible={showInserts}
                          onOpen={(target, plugin) => {
                            if (plugin) setEditingInsert({ ...target, plugin });
                            else setPickerTarget(target);
                          }}
                        />
                        {t.kind !== "bus" && (
                          <SendSlots
                            track={t}
                            tracks={tracks}
                            visible={showSends}
                            onChange={(sendSlots) => {
                              const nextRouting = {
                                ...(t.routing ?? defaultTrackRouting()),
                                sends: Object.fromEntries(
                                  sendSlots
                                    .filter(Boolean)
                                    .map((slot) => [slot!.targetId, slot!.level]),
                                ),
                              };
                              if (routingWouldCycle(tracks, t.id, nextRouting)) {
                                toast.error("That send would create an audio feedback loop.");
                                return;
                              }
                              patch(t.id, { sendSlots, routing: nextRouting });
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div
                className="relative min-w-0 flex-1 overflow-x-auto"
                style={{ minWidth: `${timelineZoom}%` }}
              >
                <div
                  className="sticky top-0 z-20 h-20 cursor-pointer border-b bg-panel"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    seek(((e.clientX - r.left) / r.width) * length);
                  }}
                >
                  <div className="flex h-full font-mono text-[10px] text-muted-foreground">
                    {ticks.map((s) => (
                      <div key={s} className="flex-1 border-l px-1 pt-1">
                        {fmtTick(s)}
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className="relative overflow-hidden"
                  onPointerDown={(event) => {
                    if (
                      event.button !== 0 ||
                      !event.isPrimary ||
                      (!event.ctrlKey && !event.metaKey)
                    )
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    const time = timelineTime(event.clientX, event.currentTarget);
                    timelineDrag.current = { start: time, current: time };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setTimelineSelection({ start: time, end: time });
                  }}
                  onPointerMove={(event) => {
                    const drag = timelineDrag.current;
                    if (!drag || !event.isPrimary || (event.buttons & 1) !== 1) return;
                    const time = timelineTime(event.clientX, event.currentTarget);
                    drag.current = time;
                    setTimelineSelection({
                      start: Math.min(drag.start, time),
                      end: Math.max(drag.start, time),
                    });
                  }}
                  onPointerUp={(event) => {
                    const drag = timelineDrag.current;
                    timelineDrag.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    if (!drag) return;
                    const time = timelineTime(event.clientX, event.currentTarget);
                    if (Math.abs(time - drag.start) <= 0.05) {
                      setTimelineSelection(null);
                      seek(time);
                    } else {
                      setLoop(true);
                    }
                  }}
                  onPointerCancel={() => {
                    timelineDrag.current = null;
                  }}
                  onLostPointerCapture={() => {
                    timelineDrag.current = null;
                  }}
                >
                  {timelineSelection && (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-20 border-x border-primary/70 bg-primary/15"
                      style={{
                        left: `${(timelineSelection.start / length) * 100}%`,
                        width: `${((timelineSelection.end - timelineSelection.start) / length) * 100}%`,
                      }}
                      aria-label={`Selected ${fmtTick(timelineSelection.end - timelineSelection.start)}`}
                    />
                  )}
                  {grid !== "free" && (
                    <div className="pointer-events-none absolute inset-0 z-10">
                      {Array.from(
                        { length: Math.ceil(length / ((60 / bpm) * GRID_BEATS[grid])) + 1 },
                        (_, index) => (
                          <div
                            key={index}
                            className="absolute inset-y-0 border-l border-primary/10"
                            style={{
                              left: `${((index * (60 / bpm) * GRID_BEATS[grid]) / length) * 100}%`,
                            }}
                          />
                        ),
                      )}
                    </div>
                  )}
                  {tracks.map((t) => (
                    <div
                      key={t.id}
                      className={`relative border-b ${
                        showInserts || (showSends && t.kind !== "bus") ? "h-[7.5rem]" : "h-14"
                      }`}
                      onDragOver={(event) => {
                        if (event.dataTransfer.types.includes("application/x-kreative-clip")) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }
                      }}
                      onDrop={(event) => {
                        const sourceId = event.dataTransfer.getData("application/x-kreative-clip");
                        event.preventDefault();
                        if (!sourceId) {
                          if (event.dataTransfer.files.length) {
                            void addFiles(event.dataTransfer.files, t.id);
                          }
                          return;
                        }
                        moveClip(sourceId, t.id, event.clientX, event.currentTarget);
                      }}
                    >
                      <div
                        draggable={t.kind !== "bus" && t.buffer.length > 1}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/x-kreative-clip", t.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          // The browser owns the drag preview; state changes occur on the destination row.
                        }}
                        className={`absolute inset-y-1 rounded-sm bg-panel-2 ${t.mute ? "opacity-40" : ""} ${selected === t.id ? "ring-1 ring-primary" : ""}`}
                        style={{
                          left: `${(t.start / length) * 100}%`,
                          width: `${((recordingPreview?.id === t.id ? recordingPreview.duration : t.buffer.duration) / length) * 100}%`,
                        }}
                      >
                        <Wave peaks={t.peaks} fill={COLORS[t.colorIdx]!.fill} />
                      </div>
                    </div>
                  ))}
                  {(tracks.length > 0 || recording) && <Playhead length={length} />}
                </div>
                {!tracks.length && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="m-6 flex h-48 w-[calc(100%-3rem)] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-muted-foreground hover:border-primary hover:text-foreground"
                  >
                    <Upload className="h-6 w-6" />
                    <span className="text-sm">
                      {recording
                        ? "Recording…"
                        : "Drop audio files here, click to upload, or press record"}
                    </span>
                    <span className="text-[10px]">
                      WAV, MP3, OGG, FLAC — each file becomes a track
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div
              className={
                mixerDetached
                  ? "fixed z-[70] flex flex-col rounded-md border bg-panel shadow-overlay"
                  : "flex h-[21rem] shrink-0 border-t bg-panel"
              }
              style={
                mixerDetached
                  ? {
                      left: mixerPosition.x,
                      top: mixerPosition.y,
                      width: `${mixerSize}vw`,
                      height: "70vh",
                      maxWidth: "90vw",
                      maxHeight: "85vh",
                    }
                  : undefined
              }
            >
              <div className="flex min-w-0 flex-1 flex-col overflow-x-auto">
                <div className="flex h-7 shrink-0 items-center justify-between border-b px-2">
                  <span
                    className={`text-[9px] tracking-[0.18em] text-muted-foreground ${mixerDetached ? "cursor-move" : ""}`}
                    onPointerDown={
                      mixerDetached
                        ? (event) => {
                            mixerDrag.current = {
                              x: event.clientX,
                              y: event.clientY,
                              startX: mixerPosition.x,
                              startY: mixerPosition.y,
                            };
                          }
                        : undefined
                    }
                  >
                    MIXER · CHANNEL STRIPS
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-lcd">
                      {tracks.length} TRACK{tracks.length === 1 ? "" : "S"}
                    </span>
                    <select
                      aria-label="Mixer size"
                      className="h-5 rounded border bg-background px-1 text-[8px]"
                      value={mixerSize}
                      onChange={(event) => setMixerSize(event.target.value)}
                    >
                      <option value="25">25%</option>
                      <option value="50">50%</option>
                      <option value="75">75%</option>
                      <option value="90">90%</option>
                    </select>
                    <button
                      className={`daw-btn h-5 w-5 ${mixerDetached ? "text-primary" : ""}`}
                      title={`${mixerDetached ? "Dock mixer" : "Detach mixer"} (Ctrl/Cmd+Shift+M)`}
                      onClick={() => setMixerDetached((value) => !value)}
                    >
                      <PictureInPicture2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 overflow-x-auto">
                  {[...tracks.map((t) => ({ t })), { t: null as TrackState | null }].map(
                    ({ t }) => (
                      <div
                        key={t?.id ?? "master"}
                        onClick={() => t && setSelected(t.id)}
                        className={`mixer-channel flex w-16 shrink-0 flex-col items-center gap-1 border-r px-1 py-1 ${
                          t && selected === t.id ? "bg-accent/40" : ""
                        }`}
                      >
                        <div
                          className="mixer-channel-header order-last flex w-full min-w-0 items-center justify-center gap-1 border-t-2 pt-1 text-[9px]"
                          style={{
                            borderColor: t ? `var(--t${(t.colorIdx % 8) + 1})` : "var(--t8)",
                          }}
                          title={t?.name ?? "Master"}
                        >
                          {t && renamingTrackId === t.id && renameSurface === "mixer" ? (
                            <input
                              autoFocus
                              className="min-w-0 flex-1 rounded border bg-background px-1 text-center text-[9px] outline-none"
                              value={renameValue}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onBlur={commitRename}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") commitRename();
                                if (event.key === "Escape") cancelRename();
                              }}
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="min-w-0 flex-1 truncate"
                              onDoubleClick={(event) => {
                                if (t) {
                                  event.stopPropagation();
                                  beginRename(t, "mixer");
                                }
                              }}
                            >
                              {t?.kind === "bus" ? "BUS · " : ""}
                              {t?.name ?? "MASTER"}
                            </span>
                          )}
                          {t && renamingTrackId !== t.id && (
                            <button
                              className="daw-btn h-4 w-4 shrink-0 border-0 p-0 opacity-60 hover:opacity-100"
                              title={`Rename ${t.name}`}
                              aria-label={`Rename ${t.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                beginRename(t, "mixer");
                              }}
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex min-h-0 w-full flex-1 flex-col gap-1 px-1 py-1">
                          <div className="flex min-h-24 min-w-0 flex-1 items-stretch justify-center gap-1 rounded-sm border border-border/60 bg-background/35 py-1">
                            <MixerFader
                              label={t?.name ?? "Master"}
                              value={t ? t.volume : masterVol}
                              onChange={(value) =>
                                t ? patch(t.id, { volume: value }) : setMasterVol(value)
                              }
                              onReset={() => (t ? patch(t.id, { volume: 0 }) : setMasterVol(0))}
                            />
                            <div className="my-1.5 w-1.5 shrink-0">
                              <Meter id={t?.id} />
                            </div>
                          </div>
                        </div>
                        <div className="w-full rounded-sm border border-border/60 bg-background px-1 py-0.5 text-center font-mono text-[9px] text-lcd">
                          {(t ? t.volume : masterVol).toFixed(1)}
                        </div>
                        {t ? (
                          <div className="flex gap-1">
                            <button
                              className={`daw-btn h-4 px-1 text-[8px] ${showRouting === t.id ? "text-primary" : ""}`}
                              title="Open input/output routing"
                              onClick={(event) => {
                                event.stopPropagation();
                                setShowRouting(showRouting === t.id ? null : t.id);
                              }}
                            >
                              I/O
                            </button>
                            <button
                              aria-label={`Solo ${t.name}`}
                              aria-pressed={t.solo}
                              onClick={(event) => {
                                event.stopPropagation();
                                patch(t.id, { solo: !t.solo });
                              }}
                              className={`daw-btn h-4 w-4 text-[8px] ${
                                t.solo ? "bg-meter-low text-background" : ""
                              }`}
                            >
                              S
                            </button>
                            <button
                              aria-label={`Mute ${t.name}`}
                              aria-pressed={t.mute}
                              onClick={(event) => {
                                event.stopPropagation();
                                patch(t.id, { mute: !t.mute });
                              }}
                              className={`daw-btn h-4 w-4 text-[8px] ${
                                t.mute ? "bg-meter-mid text-background" : ""
                              }`}
                            >
                              M
                            </button>
                          </div>
                        ) : (
                          <div className="h-4" />
                        )}
                        {t ? (
                          <>
                            <label className="flex w-full items-center gap-1 text-[8px] text-muted-foreground">
                              <span>L</span>
                              <input
                                aria-label={`Pan ${t.name}`}
                                type="range"
                                min={-1}
                                max={1}
                                step={0.01}
                                value={t.pan}
                                onClick={(event) => event.stopPropagation()}
                                onInput={(event) =>
                                  patch(t.id, { pan: Number(event.currentTarget.value) })
                                }
                                className="h-3 min-w-0 flex-1 accent-primary"
                              />
                              <span>R</span>
                            </label>
                            <div className="flex h-3 w-full items-center justify-center gap-0.5 overflow-hidden">
                              {[
                                t.fx.eqBands.length > 0 ||
                                t.fx.eqLow ||
                                t.fx.eqMid ||
                                t.fx.eqHighMid ||
                                t.fx.eqHigh ||
                                t.fx.hpOn ||
                                t.fx.lpOn
                                  ? "EQ"
                                  : "",
                                t.fx.compOn || t.fx.dynMode > 0 ? "DYN" : "",
                                t.fx.ampModel > 0 || t.fx.satMode > 0 ? "COLOR" : "",
                                t.fx.reverb > 0 || t.fx.delayType !== "off" ? "SEND" : "",
                                t.fx.smoothenOn ? "VOCAL" : "",
                                t.fx.pitchOn ? "PITCH" : "",
                              ]
                                .filter(Boolean)
                                .map((label) => (
                                  <span
                                    key={label}
                                    className="rounded bg-primary/10 px-0.5 text-[7px] text-primary"
                                  >
                                    {label}
                                  </span>
                                ))}
                            </div>
                          </>
                        ) : (
                          <div className="h-6" />
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>
              <div className="w-72 shrink-0 border-l p-2">
                <div className="border-b pb-1 text-[10px] tracking-wider text-muted-foreground">
                  MASTER · LEVEL & SPECTRUM
                </div>
                <LoudnessReadout />
                <Spectrum />
              </div>
            </div>
          </div>

          {rightPanelCollapsed ? (
            <button
              className="daw-btn absolute right-0 top-1/2 z-40 h-10 w-6 -translate-y-1/2 rounded-l border-r-0"
              title="Expand plugins and assistant panel (Ctrl/Cmd+Shift+P)"
              onClick={() => setRightPanelCollapsed(false)}
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          ) : (
            <aside className="relative flex w-72 shrink-0 flex-col border-l bg-panel">
              <div className="flex border-b">
                <button
                  className="daw-btn absolute right-1 top-1 z-10 h-5 w-5"
                  title="Collapse plugins and assistant panel (Ctrl/Cmd+Shift+P)"
                  onClick={() => setRightPanelCollapsed(true)}
                >
                  <PanelRightClose className="h-3 w-3" />
                </button>
                {["PLUGINS", "AI ASSISTANT", "ANALYSIS"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2.5 text-[10px] tracking-wider ${tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "PLUGINS" && (
                <>
                  <div className="grid grid-cols-2 gap-1 border-b p-2">
                    {(["PLUGINS", "PRESETS"] as const).map((view) => (
                      <button
                        key={view}
                        onClick={() => setPluginView(view)}
                        className={`rounded border px-2 py-1.5 text-[9px] tracking-wider ${pluginView === view ? "border-primary/50 bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-accent"}`}
                      >
                        {view === "PLUGINS" ? "ALL PLUGINS" : "PRESETS"}
                      </button>
                    ))}
                  </div>
                  <div className="p-2">
                    <div className="flex items-center gap-2 rounded border bg-background px-2 py-1.5">
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={
                          pluginView === "PLUGINS" ? "Search processors..." : "Search presets..."
                        }
                        className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {pluginView === "PLUGINS" ? (
                      Object.entries(PLUGINS).map(([cat, items]) => {
                        const list = items.filter(([n]) =>
                          n.toLowerCase().includes(query.toLowerCase()),
                        );
                        if (!list.length) return null;
                        return (
                          <div key={cat} className="border-b px-3 py-2">
                            <div className="mb-1.5 text-[9px] tracking-[0.16em] text-muted-foreground">
                              {cat.toUpperCase()}
                            </div>
                            {list.map(([p]) => (
                              <button
                                key={p}
                                title={sel ? `Insert on ${sel.name}` : "Select a track first"}
                                onClick={() => applyPlugin(p)}
                                className="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <div className="grid h-6 w-6 place-items-center rounded border border-primary/20 bg-primary/5 text-primary">
                                  <SlidersHorizontal className="h-3 w-3" />
                                </div>
                                <span className="flex-1 text-[11px]">{p}</span>
                                <span className="text-[9px] text-muted-foreground/60 group-hover:text-primary">
                                  ›
                                </span>
                              </button>
                            ))}
                          </div>
                        );
                      })
                    ) : (
                      <div className="space-y-2 p-2">
                        {PRESETS.filter((preset) =>
                          `${preset.name} ${preset.category} ${preset.description}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        ).map((preset) => (
                          <article key={preset.name} className="rounded border bg-background p-2.5">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium">{preset.name}</span>
                              <span className="rounded bg-primary/10 px-1 py-0.5 text-[8px] text-primary">
                                {preset.category}
                              </span>
                            </div>
                            <p className="mb-2 text-[9px] leading-relaxed text-muted-foreground">
                              {preset.description}
                            </p>
                            <button
                              onClick={() => {
                                if (!sel) {
                                  toast("Select a track first");
                                  return;
                                }
                                patchFx(sel.id, { ...defaultFx(), ...preset.fx });
                                const ampPluginNames = [
                                  "",
                                  "12AX7 Class A",
                                  "Tweed Combo",
                                  "British Stack",
                                  "Modern High Gain",
                                ];
                                const presetPlugins =
                                  preset.category === "Amplifiers"
                                    ? [ampPluginNames[preset.fx.ampModel ?? 0] ?? "12AX7 Class A"]
                                    : preset.name === "Tape Glue"
                                      ? [
                                          "Tape Machine",
                                          "Studio Compressor",
                                          "Four-Band Console EQ",
                                        ]
                                      : ["Studio Compressor"];
                                const inserts = Array<string | null>(10).fill(null);
                                presetPlugins.forEach((plugin, index) => {
                                  inserts[index] = plugin;
                                });
                                patch(sel.id, { inserts });
                                toast.success(`${preset.name} → ${sel.name}`);
                              }}
                              className="daw-btn h-7 w-full text-[9px] text-primary"
                            >
                              Apply to {sel?.name ?? "selected track"}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {tab === "ANALYSIS" && <AnalysisPanel tracks={tracks} selected={sel} />}
              {tab === "AI ASSISTANT" && (
                <AssistantPanel
                  tracks={tracks}
                  selected={sel}
                  masterVolume={masterVol}
                  canUndo={mixUndo !== null}
                  onApplyActions={applyAiActions}
                  onUndo={undoAiActions}
                />
              )}
            </aside>
          )}
        </div>
        {pickerTarget && (
          <InsertPicker
            target={pickerTarget}
            trackName={tracks.find((track) => track.id === pickerTarget.trackId)?.name ?? "Track"}
            onChoose={(name) => insertPlugin(name, pickerTarget)}
            onClose={() => setPickerTarget(null)}
          />
        )}
        {editingInsert && editingTrack && (
          <PluginWindow
            track={editingTrack}
            slot={editingInsert.slot}
            pluginName={editingInsert.plugin}
            onFxChange={(p) => patchFx(editingTrack.id, p)}
            onTrackChange={(p) => patch(editingTrack.id, p)}
            onReplace={() => {
              setEditingInsert(null);
              setPickerTarget({ trackId: editingTrack.id, slot: editingInsert.slot });
            }}
            onRemove={() => removePlugin(editingInsert, editingInsert.plugin)}
            onClose={() => setEditingInsert(null)}
          />
        )}
        {showSettings && (
          <SettingsModal
            value={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
        {showTemplates && (
          <TemplateLibrary
            templates={MIX_TEMPLATES}
            onApply={applyTemplate}
            onClose={() => setShowTemplates(false)}
          />
        )}
        {showExport && (
          <ExportDialog
            tracks={tracks}
            onClose={() => setShowExport(false)}
            onExport={exportAudio}
          />
        )}
        {showRouting && (
          <div className="fixed bottom-72 left-1/2 z-[75] w-80 -translate-x-1/2 rounded-md border bg-panel p-3 shadow-overlay">
            <div className="mb-2 flex items-center justify-between text-[10px] tracking-wider text-muted-foreground">
              <span>INPUT / OUTPUT · {tracks.find((track) => track.id === showRouting)?.name}</span>
              <button className="daw-btn h-5 w-5" onClick={() => setShowRouting(null)}>
                <X className="h-3 w-3" />
              </button>
            </div>
            <select
              className="w-full rounded border bg-background p-2 text-xs"
              value={
                tracks.find((track) => track.id === showRouting)?.routing?.outputBus ?? "master"
              }
              onChange={(event) => {
                const track = tracks.find((item) => item.id === showRouting);
                if (!track) return;
                const routing = {
                  ...(track.routing ?? defaultTrackRouting()),
                  outputBus: event.target.value,
                };
                if (routingWouldCycle(tracks, track.id, routing)) {
                  toast.error("That route would create an audio feedback loop.");
                  return;
                }
                patch(track.id, { routing });
              }}
            >
              <option value="master">Output · Master</option>
              {tracks
                .filter((track) => track.id !== showRouting)
                .map((track) => (
                  <option key={track.id} value={track.id}>
                    Output · {track.kind === "bus" ? "Bus · " : ""}
                    {track.name}
                  </option>
                ))}
            </select>
            <p className="mt-2 text-[9px] text-muted-foreground">
              Use the S1–S10 rack beside the inserts for live bus/send levels.
            </p>
          </div>
        )}
        {loading && <LoadingOverlay onDone={() => setLoading(false)} />}
      </div>
    </div>
  );
}
