import { useCallback, useEffect, useState } from "react";

export type ViewKind = "diagram" | "journey";

export interface ViewState {
  kind: ViewKind;
  id: string;
}

const DEFAULT_DIAGRAM_ID = "overview";
const DEFAULT_VIEW: ViewState = { kind: "diagram", id: DEFAULT_DIAGRAM_ID };

function readHash(): ViewState {
  if (typeof location === "undefined") return DEFAULT_VIEW;
  const raw = location.hash.replace(/^#/, "").trim();
  if (!raw) return DEFAULT_VIEW;
  if (raw.startsWith("diagram:")) {
    const id = raw.slice("diagram:".length).trim();
    return id ? { kind: "diagram", id } : DEFAULT_VIEW;
  }
  if (raw.startsWith("journey:")) {
    const id = raw.slice("journey:".length).trim();
    if (id) return { kind: "journey", id };
    return DEFAULT_VIEW;
  }
  // Backwards-compatible: bare id → diagram
  return { kind: "diagram", id: raw };
}

function viewToHash(v: ViewState): string {
  if (v.kind === "journey") return `#journey:${v.id}`;
  if (v.id === DEFAULT_DIAGRAM_ID) return "";
  return `#diagram:${v.id}`;
}

/**
 * The "view" — which diagram the editor is currently looking at. Bound to
 * location.hash so back/forward and bookmarks work naturally. The `kind`
 * field is here for forward-compat when additional view kinds (e.g.
 * journeys) land.
 */
export function useViewState(): {
  view: ViewState;
  navigate: (next: ViewState) => void;
  isDefault: boolean;
} {
  const [view, setView] = useState<ViewState>(() => readHash());

  useEffect(() => {
    const handler = () => setView(readHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = useCallback((next: ViewState) => {
    const hash = viewToHash(next);
    history.pushState(null, "", hash || location.pathname);
    setView(next);
  }, []);

  const isDefault = view.kind === "diagram" && view.id === DEFAULT_DIAGRAM_ID;

  return { view, navigate, isDefault };
}
