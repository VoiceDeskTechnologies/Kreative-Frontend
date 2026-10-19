import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { MixTemplate } from "./templates";

export function TemplateLibrary({
  templates,
  onApply,
  onClose,
}: {
  templates: MixTemplate[];
  onApply: (template: MixTemplate) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const filtered = useMemo(
    () =>
      templates.filter((template) => {
        const haystack =
          `${template.name} ${template.description} ${template.genres.join(" ")}`.toLowerCase();
        return (
          (category === "all" || template.category === category) &&
          haystack.includes(query.toLowerCase())
        );
      }),
    [category, query, templates],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-library-title"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border bg-card shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b p-4">
          <div className="flex-1">
            <h2 id="template-library-title" className="font-display text-lg">
              Template Library
            </h2>
            <p className="text-xs text-muted-foreground">
              Validated starting chains using KREATIVE processors.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded border bg-background px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="w-40 bg-transparent py-2 text-xs outline-none"
              placeholder="Search templates"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="daw-btn h-8 w-8"
            onClick={onClose}
            aria-label="Close template library"
            title="Close template library"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b p-3">
          {["all", "vocal", "vocal-support", "two-track-beat", "full-mix", "mastering"].map(
            (item) => (
              <button
                key={item}
                className={`rounded px-3 py-1.5 text-[10px] uppercase ${category === item ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                onClick={() => setCategory(item)}
              >
                {item.replaceAll("-", " ")}
              </button>
            ),
          )}
        </nav>
        <div className="grid min-h-0 gap-3 overflow-y-auto p-4 md:grid-cols-2">
          {filtered.map((template) => (
            <article className="rounded border bg-background p-4" key={template.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{template.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                </div>
                <span className="rounded bg-secondary px-2 py-1 text-[9px] uppercase text-muted-foreground">
                  {template.category}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {template.tracks.map((track) => (
                  <div className="rounded border bg-card/50 p-2" key={track.role}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium">{track.name}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {track.trackType === "bus" ? "BUS" : "TRACK"}
                        {track.tempoSync
                          ? ` · SYNC ${track.tempoSync === "dotted-eighth" ? "DOTTED 1/8" : "1/8"}`
                          : ""}
                        {" · OUT → "}
                        {track.outputBus}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {track.plugins.map((plugin) => (
                        <span
                          className="rounded border px-2 py-1 text-[10px]"
                          key={plugin.id}
                          title={
                            plugin.enabledByDefault ? undefined : "Optional; bypassed by default"
                          }
                        >
                          {plugin.pluginType}
                          {!plugin.enabledByDefault && (
                            <span className="text-muted-foreground"> · OPTIONAL</span>
                          )}
                        </span>
                      ))}
                      {track.sends?.map((send) => {
                        const destination =
                          template.tracks.find((candidate) => candidate.role === send.targetRole)
                            ?.name ?? send.targetRole;
                        return (
                          <span
                            className="rounded border border-amber-400/30 bg-amber-300/5 px-2 py-1 text-[10px] text-amber-100"
                            key={`${send.targetRole}-${send.levelDb}`}
                          >
                            SEND → {destination} · {send.levelDb} dB
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {template.genres.join(" · ")} · v{template.version}
                </span>
                <button
                  className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  onClick={() => onApply(template)}
                >
                  Apply Template
                </button>
              </div>
            </article>
          ))}
          {!filtered.length && (
            <p className="col-span-full py-10 text-center text-muted-foreground">
              No templates match this filter.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
