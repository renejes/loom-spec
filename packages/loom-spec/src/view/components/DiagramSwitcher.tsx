import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, FileText, Route } from "lucide-react";
import type { DiagramSummary } from "../loadDiagram";
import type { JourneySummary } from "../loadJourney";
import type { ViewState, ViewKind } from "../useViewState";

interface Props {
  currentKind: ViewKind;
  currentId: string;
  currentTitle: string;
  diagrams: DiagramSummary[];
  journeys?: JourneySummary[];
  onNavigate: (view: ViewState) => void;
  onCreate?: () => void;
}

export function DiagramSwitcher({
  currentKind,
  currentId,
  currentTitle,
  diagrams,
  journeys = [],
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
          {diagrams.length === 0 && journeys.length === 0 && (
            <div className="switcher-empty">Nothing here yet.</div>
          )}

          {diagrams.length > 0 && (
            <div className="switcher-section-label">Diagrams</div>
          )}
          {diagrams.map((d) => (
            <button
              key={`d-${d.id}`}
              className={`switcher-item ${currentKind === "diagram" && d.id === currentId ? "active" : ""}`}
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

          {journeys.length > 0 && (
            <>
              <div className="switcher-divider" />
              <div className="switcher-section-label">Journeys</div>
              {journeys.map((j) => (
                <button
                  key={`j-${j.id}`}
                  className={`switcher-item ${currentKind === "journey" && j.id === currentId ? "active" : ""}`}
                  onClick={() => {
                    onNavigate({ kind: "journey", id: j.id });
                    setOpen(false);
                  }}
                >
                  <Route size={13} className="switcher-item-icon" />
                  <div className="switcher-item-text">
                    <div className="switcher-item-title">{j.title}</div>
                    <div className="switcher-item-meta">
                      <code>{j.id}</code> · {j.stepCount} step{j.stepCount === 1 ? "" : "s"} · in <code>{j.diagram}</code>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {onCreate && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
