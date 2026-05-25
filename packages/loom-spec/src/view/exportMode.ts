/**
 * Detect whether the view is running as a standalone exported HTML (no
 * Hono server backing it; all data inlined into the page by
 * `loom-spec export-html`). In that mode we:
 *
 *  - serve data from `window.__LOOM_DATA__` instead of fetching `/api/*`
 *  - skip SSE (`new EventSource(/api/events)` would just throw)
 *  - never schedule auto-save (the server isn't there to receive it)
 *  - render the canvas non-interactive (no drag, no add, no inspector edits)
 *
 * Detection is runtime by presence of the inlined data; the same source
 * code is compiled twice (regular + export bundle) with different
 * rollup options, but no compile-time branching.
 */
import type { LoomDiagram } from "../types/diagram";
import type { LoomNodeTypes } from "../types/node-types";
import type { LoomTimeline } from "../types/timeline";

export interface ExportData {
  /** ISO timestamp when the export was generated. */
  generatedAt: string;
  /** Map of diagram id → full diagram doc. */
  diagrams: Record<string, LoomDiagram>;
  /** Map of timeline id → full timeline doc. May be empty if exported with
   *  --no-timelines. */
  timelines: Record<string, LoomTimeline>;
  nodeTypes: LoomNodeTypes;
}

declare global {
  interface Window {
    __LOOM_DATA__?: ExportData;
  }
}

export function isExportMode(): boolean {
  return typeof window !== "undefined" && !!window.__LOOM_DATA__;
}

export function getExportData(): ExportData | null {
  if (typeof window === "undefined") return null;
  return window.__LOOM_DATA__ ?? null;
}
