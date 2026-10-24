import { useEffect, useRef, useState } from "react";
import {
  Check,
  LoaderCircle,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { appConfig } from "@/lib/app-config";
import {
  parseAiMixPlan,
  parseAiAnalysis,
  encodeTrackAudio,
  snapshotProject,
  type AiAnalysis,
  type AiConversationMessage,
  type AiMixAction,
} from "./ai-mix-types";
import type { TrackState } from "./engine";

type ChatMessage = AiConversationMessage & {
  id: string;
  status?: "applying" | "applied" | "error";
  actionCount?: number;
  progress?: string;
};

type AiStatus = {
  available: boolean;
  provider: "openai" | "gemini" | null;
  sendsAudio: boolean;
  requiresConsent: true;
};

export function AssistantPanel({
  tracks,
  selected,
  masterVolume,
  canUndo,
  onApplyActions,
  onUndo,
}: {
  tracks: TrackState[];
  selected: TrackState | null;
  masterVolume: number;
  canUndo: boolean;
  onApplyActions: (
    actions: AiMixAction[],
    onProgress: (index: number, label: string) => void,
  ) => Promise<void>;
  onUndo: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Describe the changes you want. I can plan track-level processing, balance, and master headroom, then apply each validated change live. Follow-ups can target just one track or processor.",
    },
  ]);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analysisKey, setAnalysisKey] = useState("");
  const [reference, setReference] = useState<{
    name: string;
    mimeType: "audio/wav";
    audioBase64: string;
  } | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [referenceRevision, setReferenceRevision] = useState(0);
  const currentAnalysisKey = `${tracks
    .map((track) => `${track.id}:${track.buffer.length}:${track.buffer.sampleRate}`)
    .join("|")}|reference:${referenceRevision}`;

  useEffect(() => {
    if (analysisKey !== currentAnalysisKey) setAnalysis(null);
  }, [analysisKey, currentAnalysisKey]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${appConfig.apiBaseUrl}/ai/status`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`AI status request failed (${response.status}).`);
        const value: unknown = await response.json();
        if (
          !value ||
          typeof value !== "object" ||
          !("available" in value) ||
          !("provider" in value) ||
          !("sendsAudio" in value) ||
          !("requiresConsent" in value)
        ) {
          throw new Error("The backend returned an invalid AI status response.");
        }
        setStatus(value as AiStatus);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatusError(error instanceof Error ? error.message : "Couldn't check AI availability.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const addAssistantError = (message: string) => {
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", content: message, status: "error" },
    ]);
  };

  const chooseReference = async (file: File) => {
    setReferenceError(null);
    try {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        setReference({
          name: file.name,
          mimeType: "audio/wav",
          audioBase64: encodeTrackAudio(buffer),
        });
        setReferenceRevision((value) => value + 1);
        setAnalysis(null);
        setAnalysisKey("");
      } finally {
        await context.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't read that audio file.";
      setReferenceError(`Reference upload failed: ${message}`);
      toast.error("Choose a supported audio file for the reference.");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (!status?.available) {
      addAssistantError("The mix assistant is temporarily unavailable. Please try again later.");
      return;
    }
    if (!tracks.length) {
      addAssistantError("Add at least one audio track before asking for an audio mix analysis.");
      return;
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);
    let assistantId: string | null = null;

    try {
      let cachedAnalysis = analysis;
      if (!cachedAnalysis || analysisKey !== currentAnalysisKey) {
        const project = snapshotProject(tracks, selected?.id ?? null, masterVolume);
        const analysisResponse = await fetch(`${appConfig.apiBaseUrl}/ai/analyze`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            project,
            tracks: tracks.map((track) => ({
              trackId: track.id,
              name: track.name,
              mimeType: "audio/wav",
              audioBase64: encodeTrackAudio(track.buffer),
            })),
            ...(reference ? { reference } : {}),
          }),
        });
        const analysisBody: unknown = await analysisResponse.json();
        if (!analysisResponse.ok) {
          throw new Error("Audio analysis failed. Please try again.");
        }
        cachedAnalysis = parseAiAnalysis(analysisBody);
        setAnalysis(cachedAnalysis);
        setAnalysisKey(currentAnalysisKey);
      }
      const response = await fetch(`${appConfig.apiBaseUrl}/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation: nextMessages
            .filter((message) => message.id !== "welcome" && message.status !== "error")
            .slice(-16)
            .map(({ role, content }) => ({ role, content })),
          project: snapshotProject(tracks, selected?.id ?? null, masterVolume),
          analysis: cachedAnalysis,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error("Couldn't complete that request. Please try again.");
      }

      const plan = parseAiMixPlan(body);
      const messageId = crypto.randomUUID();
      assistantId = messageId;
      setMessages((current) => [
        ...current,
        {
          id: messageId,
          role: "assistant",
          content: plan.message,
          actionCount: plan.actions.length,
          status: plan.actions.length ? "applying" : "applied",
        },
      ]);

      if (plan.actions.length) {
        await onApplyActions(plan.actions, (index, label) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === messageId
                ? { ...message, progress: `${index + 1}/${plan.actions.length} · ${label}` }
                : message,
            ),
          );
        });
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== messageId) return message;
            const completed = { ...message, status: "applied" as const };
            delete completed.progress;
            return completed;
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI request failed.";
      if (assistantId) {
        const failedId = assistantId;
        setMessages((current) =>
          current.map((item) =>
            item.id === failedId
              ? { ...item, content: `${item.content}\n\nStopped: ${message}`, status: "error" }
              : item,
          ),
        );
      } else {
        addAssistantError(message);
      }
      toast.error(message);
    } finally {
      setBusy(false);
      textAreaRef.current?.focus();
    }
  };

  const promptIdeas = selected
    ? [
        `Make ${selected.name} clearer but keep it natural`,
        `Tighten the low end without changing other tracks`,
      ]
    : [
        "Balance the full mix and leave headroom",
        "Make a clean, modern mix with a controlled low end",
      ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="grid h-8 w-8 place-items-center rounded border border-primary/30 bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium">Mix assistant</div>
          <div className="text-[9px] tracking-wider text-muted-foreground">
            {status?.available ? "CONNECTED" : "ASSISTANT STATUS"}
          </div>
        </div>
        {canUndo && !busy && (
          <button
            className="daw-btn flex h-7 items-center gap-1 px-2 text-[9px] text-primary"
            onClick={onUndo}
          >
            <RotateCcw className="h-3 w-3" />
            Undo
          </button>
        )}
      </div>

      {!status && !statusError && (
        <div className="border-b px-3 py-2 text-[9px] text-muted-foreground">
          Checking assistant availability…
        </div>
      )}
      {(statusError || status?.available === false) && (
        <div className="border-b border-meter-mid/25 bg-meter-mid/5 px-3 py-2 text-[9px] leading-relaxed text-muted-foreground">
          The mix assistant is temporarily unavailable. Please try again later.
        </div>
      )}
      {status?.available && (
        <div className="border-b px-3 py-2 text-[9px] text-muted-foreground">
          {analysis
            ? "AUDIO ANALYSIS CACHED · FOLLOW-UPS USE THE EXISTING ANALYSIS"
            : "FIRST REQUEST ANALYZES EACH TRACK ONCE; FOLLOW-UPS SKIP THE RESCAN"}
        </div>
      )}

      <div ref={feedRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded border p-2.5 ${
              message.role === "user"
                ? "ml-5 border-primary/30 bg-primary/5"
                : message.status === "error"
                  ? "mr-2 border-meter-high/30 bg-meter-high/5"
                  : "mr-2 border-border bg-panel-2"
            }`}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[8px] tracking-wider text-muted-foreground">
              {message.role === "assistant" ? (
                <WandSparkles className="h-3 w-3 text-primary" />
              ) : null}
              {message.role === "user" ? "YOU" : "KREATIVE MIX ASSISTANT"}
            </div>
            <p className="whitespace-pre-wrap text-[10px] leading-relaxed">{message.content}</p>
            {message.actionCount ? (
              <div className="mt-2 flex items-center gap-1 text-[8px] text-muted-foreground">
                {message.status === "applying" ? (
                  <LoaderCircle className="h-3 w-3 animate-spin text-primary" />
                ) : message.status === "applied" ? (
                  <Check className="h-3 w-3 text-meter-low" />
                ) : null}
                {message.progress ??
                  (message.status === "applied"
                    ? `${message.actionCount} live changes applied`
                    : "Preparing changes")}
              </div>
            ) : null}
          </article>
        ))}
        {busy && (
          <div className="flex items-center gap-2 px-2 text-[9px] text-muted-foreground">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
            Planning bounded mix changes…
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="space-y-1 px-3 pb-2">
          {promptIdeas.map((idea) => (
            <button
              key={idea}
              className="daw-btn block w-full truncate px-2 py-1 text-left text-[9px] text-muted-foreground"
              onClick={() => setDraft(idea)}
              disabled={busy}
            >
              {idea}
            </button>
          ))}
        </div>
      )}

      <div className="border-t p-2">
        <div className="rounded border bg-background p-1.5">
          {reference && (
            <div className="mb-1.5 flex items-center gap-1.5 rounded border border-primary/25 bg-primary/5 px-2 py-1 text-[9px]">
              <span className="min-w-0 flex-1 truncate text-primary">
                Reference: {reference.name}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Remove reference song"
                title="Remove reference song"
                onClick={() => {
                  setReference(null);
                  setReferenceRevision((value) => value + 1);
                  setAnalysis(null);
                  setAnalysisKey("");
                }}
                disabled={busy}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {referenceError && (
            <div className="mb-1.5 text-[8px] text-meter-high">{referenceError}</div>
          )}
          <textarea
            ref={textAreaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Describe the mix change you want…"
            maxLength={2500}
            rows={3}
            className="w-full resize-none bg-transparent p-1 text-[10px] outline-none placeholder:text-muted-foreground"
            disabled={busy}
          />
          <div className="flex items-center justify-between border-t pt-1.5">
            <span className="text-[8px] text-muted-foreground">
              Enter to send · Shift+Enter for new line
            </span>
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void chooseReference(file);
                }}
              />
              <button
                type="button"
                className="daw-btn grid h-7 w-7 place-items-center text-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                aria-label="Add reference song"
                title="Add reference song"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                className="daw-btn flex h-7 items-center gap-1 px-2 text-[9px] text-primary"
                onClick={() => void send()}
                disabled={busy || !draft.trim()}
              >
                {busy ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Send
              </button>
            </div>
          </div>
        </div>
        <div className="mt-1 text-[8px] text-muted-foreground">
          Mix actions are applied live and can be undone as a plan.
        </div>
      </div>
    </div>
  );
}
