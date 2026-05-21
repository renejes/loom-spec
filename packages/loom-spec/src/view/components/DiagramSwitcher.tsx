import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, FileText, Clock } from "lucide-react";
import type { DiagramSummary, TimelineSummary } from "../loadDiagram";
import type { ViewState } from "../useViewState";

interface Props {
  currentKind: "diagram" | "timeline";
  currentId: string;
  currentTitle: string;
  diagrams: DiagramSummary[];
  timelines: TimelineSummary[];
  onNavigate: (view: ViewState) => void;
  onCreate: () => void;
}

export function DiagramSwitcher({
  currentKind,
  currentId,
  currentTitle,
  diagrams,
  timelines,
  onNavigate,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const isActive = (kind: "diagram" | "timeline", id: string) =>
    kind === currentKind && id === currentId;

  return (
    <div className="diagram-switcher" ref={ref}>
      <button
        className="switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="switcher-title">{currentTitle}</span>
        <ChevronDown size={14} className={open ? "flip" : ""} />
      </button>
      {open && (
        <div className="switcher-menu" role="listbox">
          {diagrams.length === 0 && timelines.length === 0 && (
            <div className="switcher-empty">Nothing here yet.</div>
          )}

          {diagrams.length > 0 && (
            <div className="switcher-section-label">Diagrams</div>
          )}
          {diagrams.map((d) => (
            <button
              key={`d-${d.id}`}
              className={`switcher-item ${isActive("diagram", d.id) ? "active" : ""}`}
              onClick={() => {
                onNavigate({ kind: "diagram", id: d.id });
                setOpen(false);
              }}
            >
              <FileText size={13} className="switcher-item-icon" />
              <div className="switcher-item-text">
                <div className="switcher-item-title">{d.title}</div>
                <div className="switcher-item-meta">
                  <code>{d.id}</code> · {d.nodeCount} nodes · {d.edgeCount} edges
                </div>
              </div>
            </button>
          ))}

          {timelines.length > 0 && (
            <>
              <div className="switcher-divider" />
              <div className="switcher-section-label">Timelines</div>
              {timelines.map((t) => (
                <button
                  key={`t-${t.id}`}
                  className={`switcher-item ${isActive("timeline", t.id) ? "active" : ""}`}
                  onClick={() => {
                    onNavigate({ kind: "timeline", id: t.id });
                    setOpen(false);
                  }}
                >
                  <Clock size={13} className="switcher-item-icon" />
                  <div className="switcher-item-text">
                    <div className="switcher-item-title">{t.title}</div>
                    <div className="switcher-item-meta">
                      <code>{t.id}</code> · {t.eventCount} events · {formatDuration(t.totalDurationMs)}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          <div className="switcher-divider" />
          <button
            className="switcher-item new"
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
          >
            <Plus size={13} className="switcher-item-icon" />
            <span>New diagram…</span>
          </button>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms === 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
