import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, FileText } from "lucide-react";
import type { DiagramSummary } from "../loadDiagram";

interface Props {
  currentId: string;
  currentTitle: string;
  diagrams: DiagramSummary[];
  onNavigate: (id: string) => void;
  onCreate: () => void;
}

export function DiagramSwitcher({
  currentId,
  currentTitle,
  diagrams,
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
          {diagrams.length === 0 && (
            <div className="switcher-empty">No diagrams found.</div>
          )}
          {diagrams.map((d) => (
            <button
              key={d.id}
              className={`switcher-item ${d.id === currentId ? "active" : ""}`}
              onClick={() => {
                onNavigate(d.id);
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
