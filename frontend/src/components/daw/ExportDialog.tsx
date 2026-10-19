import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { audioTracks, type ExportFormat, type ExportOptions } from "./export-audio";
import type { TrackState } from "./engine";

type ExportDialogProps = {
  tracks: TrackState[];
  onClose: () => void;
  onExport: (
    options: ExportOptions,
    onProgress: (percent: number, message: string) => void,
  ) => Promise<void>;
};

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function ExportDialog({ tracks, onClose, onExport }: ExportDialogProps) {
  const availableTracks = audioTracks(tracks);
  const projectLength = Math.max(
    0,
    ...availableTracks.map((track) => track.start + track.buffer.duration),
  );
  const [name, setName] = useState("Untitled Mix");
  const [format, setFormat] = useState<ExportFormat>("wav");
  const [bitDepth, setBitDepth] = useState<16 | 24 | 32>(24);
  const [bitrate, setBitrate] = useState<128 | 192 | 320>(192);
  const [fullProject, setFullProject] = useState(true);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(projectLength);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const exportStart = fullProject ? 0 : start;
  const exportEnd = fullProject ? projectLength : end;

  const handleExport = async () => {
    if (!name.trim()) {
      setMessage("Enter a name for your export.");
      return;
    }
    if (format === "zip" && !availableTracks.length) {
      setMessage("Add an audio track before exporting stems.");
      return;
    }
    if (
      !Number.isFinite(exportStart) ||
      !Number.isFinite(exportEnd) ||
      exportStart < 0 ||
      exportEnd > projectLength ||
      exportEnd <= exportStart
    ) {
      setMessage("The end time must be after the start time.");
      return;
    }
    setBusy(true);
    setProgress(0);
    setMessage("Preparing export...");
    try {
      await onExport(
        { name, format, bitDepth, bitrate, start: exportStart, end: exportEnd },
        (percent, status) => {
          setProgress(percent);
          setMessage(status);
        },
      );
      setProgress(100);
      setMessage("Export saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export audio</DialogTitle>
          <DialogDescription>
            Save the finished mix or export each audio track as an individual stem.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <label className="block space-y-1.5">
            <span className="text-muted-foreground">File name</span>
            <input
              className="w-full rounded border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-ring"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-muted-foreground">Export range</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={fullProject}
                onChange={() => setFullProject(true)}
                disabled={busy}
              />
              Entire project{" "}
              <span className="text-xs text-muted-foreground">({formatTime(projectLength)})</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!fullProject}
                onChange={() => setFullProject(false)}
                disabled={busy}
              />
              Selected time range
            </label>
            {!fullProject && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Start (seconds)</span>
                  <input
                    className="w-full rounded border bg-background px-2 py-1.5"
                    type="number"
                    min={0}
                    max={projectLength}
                    step={0.1}
                    value={start}
                    onChange={(event) => setStart(Number(event.target.value))}
                    disabled={busy}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">End (seconds)</span>
                  <input
                    className="w-full rounded border bg-background px-2 py-1.5"
                    type="number"
                    min={0}
                    max={projectLength}
                    step={0.1}
                    value={end}
                    onChange={(event) => setEnd(Number(event.target.value))}
                    disabled={busy}
                  />
                </label>
              </div>
            )}
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-muted-foreground">Format</span>
            <select
              className="w-full rounded border bg-background px-3 py-2"
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
              disabled={busy}
            >
              <option value="wav">WAV · uncompressed mix</option>
              <option value="mp3">MP3 · compressed mix</option>
              <option value="zip">ZIP · individual WAV stems</option>
            </select>
          </label>

          {format === "wav" && (
            <label className="block space-y-1.5">
              <span className="text-muted-foreground">Bit depth</span>
              <select
                className="w-full rounded border bg-background px-3 py-2"
                value={bitDepth}
                onChange={(event) => setBitDepth(Number(event.target.value) as 16 | 24 | 32)}
                disabled={busy}
              >
                <option value={16}>16-bit PCM</option>
                <option value={24}>24-bit PCM</option>
                <option value={32}>32-bit float</option>
              </select>
            </label>
          )}

          {format === "mp3" && (
            <label className="block space-y-1.5">
              <span className="text-muted-foreground">MP3 bitrate</span>
              <select
                className="w-full rounded border bg-background px-3 py-2"
                value={bitrate}
                onChange={(event) => setBitrate(Number(event.target.value) as 128 | 192 | 320)}
                disabled={busy}
              >
                <option value={128}>128 kbps</option>
                <option value={192}>192 kbps</option>
                <option value={320}>320 kbps</option>
              </select>
            </label>
          )}

          {format === "zip" && (
            <p className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {availableTracks.length} audio {availableTracks.length === 1 ? "track" : "tracks"}{" "}
              will be rendered as individual WAV files ({bitDepth}-bit) and bundled into one ZIP.
            </p>
          )}

          {(busy || message) && (
            <div className="space-y-2" aria-live="polite">
              {busy && <Progress value={progress} aria-label="Export progress" />}
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                {message}
                {busy && <span className="ml-auto font-mono">{Math.round(progress)}%</span>}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <button className="daw-btn h-9 px-3 text-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="daw-btn flex h-9 items-center gap-2 bg-primary px-3 text-sm text-primary-foreground"
              onClick={() => void handleExport()}
              disabled={busy}
            >
              <Download className="h-4 w-4" />
              {busy ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
