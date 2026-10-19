import { useEffect, useState, type ReactNode } from "react";
import { AudioLines, CircleHelp, Keyboard, MonitorCog, SlidersHorizontal, X } from "lucide-react";
import { engine } from "./engine";
import { DAW_SHORTCUTS } from "./daw-shortcuts";

export type Settings = {
  inputId: string;
  outputId?: string;
  echoCancel: boolean;
  noiseSuppress: boolean;
  autoGainControl?: boolean;
  sampleRate?: string;
  theme?: "dark" | "midnight";
  confirmDestructive?: boolean;
  showTips?: boolean;
  autosave?: boolean;
  gridDivision?: "free" | "1/2" | "1/4" | "1/8" | "1/16" | "1/32";
  timelineZoom?: number;
  mixerSize?: string;
};

type Section = "audio" | "general" | "editing" | "shortcuts" | "about";

const sections: Array<{ id: Section; label: string; icon: typeof AudioLines }> = [
  { id: "audio", label: "Audio Preferences", icon: AudioLines },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "editing", label: "Editing & Display", icon: MonitorCog },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
  { id: "about", label: "About KREATIVE", icon: CircleHelp },
];

export function SettingsModal({
  value,
  onChange,
  onClose,
}: {
  value: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("audio");
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const ctx = engine.ctx;
  const update = (patch: Partial<Settings>) => onChange({ ...value, ...patch });
  const loadDevices = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setInputs(devices.filter((device) => device.kind === "audioinput"));
    setOutputs(devices.filter((device) => device.kind === "audiooutput"));
  };

  useEffect(() => {
    void loadDevices();
  }, []);

  useEffect(() => {
    window.localStorage.setItem("kreative.settings.v1", JSON.stringify(value));
  }, [value]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const audioContext = ctx as
      | (AudioContext & {
          setSinkId?: (sinkId: string) => Promise<void>;
        })
      | null;
    if (audioContext?.setSinkId && value.outputId) void audioContext.setSinkId(value.outputId);
  }, [ctx, value.outputId]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full min-h-[440px] w-full max-w-2xl flex-col overflow-hidden rounded-md border bg-popover shadow-[var(--shadow-overlay)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="font-display text-sm tracking-wider">PREFERENCES</div>
            <div className="text-[10px] text-muted-foreground">KREATIVE STUDIO CONFIGURATION</div>
          </div>
          <button
            type="button"
            className="daw-btn h-7 w-7"
            onClick={onClose}
            aria-label="Close settings"
            title="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <nav className="w-48 shrink-0 border-r bg-panel p-2">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[10px] ${section === id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                onClick={() => setSection(id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </nav>
          <main className="min-h-0 flex-1 overflow-y-auto p-5 text-xs">
            {section === "audio" && (
              <AudioPreferences
                value={value}
                outputs={outputs}
                inputs={inputs}
                update={update}
                reload={loadDevices}
                context={ctx}
              />
            )}
            {section === "general" && <GeneralPreferences value={value} update={update} />}
            {section === "editing" && <EditingPreferences value={value} update={update} />}
            {section === "shortcuts" && <Shortcuts />}
            {section === "about" && <About />}
          </main>
        </div>
      </div>
    </div>
  );
}

function AudioPreferences({
  value,
  outputs,
  inputs,
  update,
  reload,
  context,
}: {
  value: Settings;
  outputs: MediaDeviceInfo[];
  inputs: MediaDeviceInfo[];
  update: (patch: Partial<Settings>) => void;
  reload: () => Promise<void>;
  context: AudioContext | null;
}) {
  return (
    <Page
      title="Audio Preferences"
      description="Configure recording, playback, and browser audio behavior."
    >
      <Setting label="Input device" description="Microphone or interface used when recording.">
        <select
          value={value.inputId}
          onChange={(event) => update({ inputId: event.target.value })}
          className="settings-select"
        >
          <option value="">System default</option>
          {inputs.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {device.label || `Microphone ${index + 1}`}
            </option>
          ))}
        </select>
      </Setting>
      <Setting label="Output device" description="Playback device when supported by this browser.">
        <select
          value={value.outputId ?? ""}
          onChange={(event) => update({ outputId: event.target.value })}
          className="settings-select"
        >
          <option value="">System default</option>
          {outputs.map((device, index) => (
            <option key={device.deviceId || index} value={device.deviceId}>
              {device.label || `Output ${index + 1}`}
            </option>
          ))}
        </select>
      </Setting>
      <Setting
        label="Sample rate"
        description="The browser AudioContext sample rate. It cannot be changed after the engine starts."
      >
        <div className="rounded border bg-background px-2 py-1.5 font-mono">
          {context ? `${context.sampleRate} Hz` : "Audio engine starts when audio is added"}
        </div>
      </Setting>
      <Check
        label="Echo cancellation"
        checked={value.echoCancel}
        onChange={(checked) => update({ echoCancel: checked })}
      />
      <Check
        label="Noise suppression"
        checked={value.noiseSuppress}
        onChange={(checked) => update({ noiseSuppress: checked })}
      />
      <Check
        label="Automatic input gain"
        checked={value.autoGainControl ?? false}
        onChange={(checked) => update({ autoGainControl: checked })}
      />
      <button
        className="text-[10px] text-primary"
        onClick={async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
            await reload();
          } catch {
            /* Browser permission is optional. */
          }
        }}
      >
        Allow microphone access to reveal device names
      </button>
    </Page>
  );
}

function GeneralPreferences({
  value,
  update,
}: {
  value: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  return (
    <Page title="General" description="Choose safe defaults for sessions and account behavior.">
      <Check
        label="Confirm destructive actions"
        checked={value.confirmDestructive ?? true}
        onChange={(checked) => update({ confirmDestructive: checked })}
      />
      <Check
        label="Show workflow tips"
        checked={value.showTips ?? true}
        onChange={(checked) => update({ showTips: checked })}
      />
      <Check
        label="Save session preferences locally"
        checked={value.autosave ?? true}
        onChange={(checked) => update({ autosave: checked })}
      />
      <Setting
        label="Interface theme"
        description="KREATIVE currently ships with its professional dark interface."
      >
        <select
          className="settings-select"
          value={value.theme ?? "dark"}
          onChange={(event) =>
            update({ theme: event.target.value === "midnight" ? "midnight" : "dark" })
          }
        >
          <option value="dark">Dark</option>
          <option value="midnight">Midnight</option>
        </select>
      </Setting>
    </Page>
  );
}

function EditingPreferences({
  value,
  update,
}: {
  value: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  return (
    <Page
      title="Editing & Display"
      description="Preferences that make timeline editing feel familiar to DAW users."
    >
      <div className="rounded border border-primary/30 bg-primary/5 p-3 text-[10px] text-muted-foreground">
        Grid division, timeline zoom, mixer size, and panel layout are available directly in the
        workspace for fast access.
      </div>
      <Setting
        label="Default grid division"
        description="The grid selected when a new session opens."
      >
        <select
          className="settings-select"
          value={value.gridDivision ?? "1/4"}
          onChange={(event) =>
            update({ gridDivision: event.target.value as NonNullable<Settings["gridDivision"]> })
          }
        >
          <option value="free">Free</option>
          <option value="1/2">1/2</option>
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/32">1/32</option>
        </select>
      </Setting>
      <Setting
        label="Default timeline zoom"
        description="The horizontal editing zoom used when the DAW opens."
      >
        <select
          className="settings-select"
          value={value.timelineZoom ?? 100}
          onChange={(event) => update({ timelineZoom: Number(event.target.value) })}
        >
          <option value="50">50%</option>
          <option value="75">75%</option>
          <option value="100">100%</option>
          <option value="150">150%</option>
          <option value="200">200%</option>
        </select>
      </Setting>
      <Setting label="Default mixer size" description="The width used when the mixer is detached.">
        <select
          className="settings-select"
          value={value.mixerSize ?? "50"}
          onChange={(event) => update({ mixerSize: event.target.value })}
        >
          <option value="25">25%</option>
          <option value="50">50%</option>
          <option value="75">75%</option>
          <option value="90">90%</option>
        </select>
      </Setting>
    </Page>
  );
}

function Shortcuts() {
  return (
    <Page title="Keyboard Shortcuts" description="Fast controls for recording and editing.">
      {DAW_SHORTCUTS.map(({ key, action }) => (
        <div className="flex items-center justify-between border-b py-2" key={key}>
          <kbd className="rounded border bg-background px-2 py-1 font-mono text-[10px]">{key}</kbd>
          <span className="text-muted-foreground">{action}</span>
        </div>
      ))}
    </Page>
  );
}

function About() {
  return (
    <Page title="About KREATIVE" description="Browser-based AI mixing and mastering workspace.">
      <div className="rounded border bg-background p-4">
        <div className="font-display text-lg">KREATIVE STUDIO</div>
        <p className="mt-2 text-muted-foreground">
          A browser DAW with live Web Audio processing, editable mixer routing, template chains, and
          AI-assisted workflows.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
          <span className="text-muted-foreground">Version</span>
          <span>0.1.0</span>
          <span className="text-muted-foreground">Audio engine</span>
          <span>{engine.ctx ? "Running" : "Ready on first audio"}</span>
          <span className="text-muted-foreground">Processing</span>
          <span>Browser-local DSP</span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Account, assistant, and billing features are securely configured by the application.
      </p>
    </Page>
  );
}

function Page({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="border-b pb-3">
        <h2 className="font-display text-sm">{title}</h2>
        <p className="mt-1 text-[10px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Setting({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b py-3 md:grid-cols-[1fr_220px] md:items-center">
      <div>
        <div>{label}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 border-b py-2">
      <input
        type="checkbox"
        className="accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
