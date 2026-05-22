import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { findLoomRoot } from "../server/findLoomRoot.js";
import { readDiagram, readTimeline, writeTimeline } from "../server/fileOps.js";
import { parseOtlpJson, type ParsedSpan, type SpanKind } from "../server/otel.js";
import { validateTimeline } from "../validate.js";
import type { Node as LoomNode } from "../types/diagram.js";
import type { LoomTimeline, TimelineEvent } from "../types/timeline.js";

export interface ImportTraceArgs {
  /** Path to the OTLP JSON trace file. */
  trace: string;
  /** Timeline id to create or append into. */
  asId: string;
  /** Diagram id the new timeline overlays. */
  diagramId: string;
  /** Optional path to a mapping file (see MappingFile shape below). */
  map?: string;
  /** Append to an existing timeline instead of overwriting. */
  append: boolean;
  /** Working directory root (walked up to find .loom/). */
  root: string;
}

/**
 * Mapping file: lets the user override the auto-heuristic when span names
 * or service names don't line up with node ids cleanly.
 *
 *   {
 *     "services": { "<service.name>": "<node-id>", ... },
 *     "spans":    { "<span.name>":    "<node-id>", ... }
 *   }
 *
 * `spans` wins over `services` when both match a given span.
 */
interface MappingFile {
  services?: Record<string, string>;
  spans?: Record<string, string>;
}

interface ResolvedMapping {
  serviceMap: Map<string, string>;
  spanMap: Map<string, string>;
}

const KIND_TO_EVENT_KIND: Record<SpanKind, TimelineEvent["kind"]> = {
  internal: "compute",
  server: "io",
  client: "io",
  producer: "io",
  consumer: "io",
  unknown: undefined,
};

async function loadMapping(path: string): Promise<ResolvedMapping> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as MappingFile;
  return {
    serviceMap: new Map(Object.entries(parsed.services ?? {})),
    spanMap: new Map(Object.entries(parsed.spans ?? {})),
  };
}

/**
 * Decide which node a span belongs to.
 * Precedence: explicit span map > explicit service map > heuristic match.
 */
function resolveNode(
  span: ParsedSpan,
  mapping: ResolvedMapping | null,
  nodes: LoomNode[]
): string | null {
  if (mapping) {
    const direct = mapping.spanMap.get(span.name);
    if (direct) return direct;
    if (span.serviceName) {
      const svc = mapping.serviceMap.get(span.serviceName);
      if (svc) return svc;
    }
  }
  // Heuristic: try matching span.name first (it's most specific — for
  // CLIENT/PRODUCER spans it names the *downstream* target, which is the
  // node we want), then fall back to service.name.
  const candidates: string[] = [];
  candidates.push(span.name.toLowerCase());
  if (span.serviceName) candidates.push(span.serviceName.toLowerCase());
  for (const c of candidates) {
    // 1. exact id match
    const idHit = nodes.find((n) => n.id.toLowerCase() === c);
    if (idHit) return idHit.id;
    // 2. node id appears as a token inside the candidate
    //    (e.g. "todo-store update" → finds id "todo-store")
    const idInCandidate = nodes.find((n) => c.includes(n.id.toLowerCase()));
    if (idInCandidate) return idInCandidate.id;
    // 3. candidate appears in a node label
    //    (e.g. "todo-api" → finds label "Todo API")
    const labelHit = nodes.find((n) => n.label.toLowerCase().includes(c));
    if (labelHit) return labelHit.id;
    // 4. code-ref path includes the candidate
    const refHit = nodes.find((n) =>
      (n.code_refs ?? []).some((r) => r.path.toLowerCase().includes(c))
    );
    if (refHit) return refHit.id;
  }
  return null;
}

function eventIdFor(spanId: string, existingIds: Set<string>): string {
  // Stable: take the first 8 hex chars of the span id, prefix with "ev".
  // Fall back to a sequence if collision (shouldn't happen in practice).
  const base = `ev-${spanId.slice(0, 8) || "span"}`.toLowerCase();
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export async function runImportTrace(args: ImportTraceArgs): Promise<void> {
  // 1. Locate the .loom/ root and load the diagram we're overlaying.
  const loomRoot = await findLoomRoot(args.root);
  const diagram = await readDiagram(loomRoot.loomPath, args.diagramId);

  // 2. Load and parse the trace.
  const traceRaw = await readFile(resolve(args.trace), "utf8");
  const traceJson = JSON.parse(traceRaw) as unknown;
  const spans = parseOtlpJson(traceJson);
  if (spans.length === 0) {
    console.error("Trace contained 0 spans — nothing to import.");
    process.exit(1);
  }

  // 3. Optional mapping file.
  const mapping = args.map ? await loadMapping(resolve(args.map)) : null;

  // 4. Compute t=0 (earliest span start) so the timeline is repo-portable.
  const minStartNs = spans.reduce(
    (m, s) => (s.startNs < m ? s.startNs : m),
    spans[0]!.startNs
  );

  // 5. If appending, load existing timeline; otherwise start fresh.
  let existing: LoomTimeline | null = null;
  if (args.append) {
    try {
      existing = await readTimeline(loomRoot.loomPath, args.asId);
      if (existing.diagram !== args.diagramId) {
        console.error(
          `Refusing to append: existing timeline '${args.asId}' references diagram ` +
            `'${existing.diagram}', not '${args.diagramId}'.`
        );
        process.exit(1);
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      // Fall through: --append on a missing file behaves like create.
    }
  }

  const existingIds = new Set(existing?.events.map((e) => e.id) ?? []);
  const spanIdToEventId = new Map<string, string>();
  const events: TimelineEvent[] = [];
  const skipped: { span: ParsedSpan; reason: string }[] = [];

  // 6. First pass: pick node + event id for each span.
  for (const s of spans) {
    const node = resolveNode(s, mapping, diagram.nodes);
    if (!node) {
      skipped.push({ span: s, reason: "no matching node" });
      continue;
    }
    const id = eventIdFor(s.spanId, existingIds);
    existingIds.add(id);
    spanIdToEventId.set(s.spanId, id);
    const start_ms = Number((s.startNs - minStartNs) / 1_000_000n);
    const duration_ms = Number((s.endNs - s.startNs) / 1_000_000n);
    events.push({
      id,
      node,
      start_ms: Math.max(0, start_ms),
      duration_ms: Math.max(0, duration_ms),
      label: s.name.length > 60 ? s.name.slice(0, 57) + "…" : s.name,
      kind: KIND_TO_EVENT_KIND[s.kind] ?? "compute",
      track: s.serviceName ?? undefined,
      tags: [`otel-import`, `kind:${s.kind}`],
    });
  }

  // 7. Second pass: wire triggered_by from span parent.
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]!;
    const ev = events.find((e) => e.id === spanIdToEventId.get(s.spanId));
    if (!ev) continue;
    if (s.parentSpanId) {
      const parentEventId = spanIdToEventId.get(s.parentSpanId);
      if (parentEventId) ev.triggered_by = parentEventId;
    }
  }

  // 8. Build the timeline. Auto-derive tracks from distinct services.
  const trackIds = new Set(
    (existing?.tracks?.map((t) => t.id) ?? []).concat(
      events.map((e) => e.track).filter((t): t is string => !!t)
    )
  );
  const tracks = Array.from(trackIds).map((id) => ({ id, label: id }));

  const timeline: LoomTimeline = {
    version: "1",
    id: args.asId,
    title: existing?.title ?? `Imported: ${args.asId}`,
    description:
      existing?.description ??
      `Generated by 'loom-spec import-trace' from ${args.trace}.`,
    diagram: args.diagramId,
    events: existing ? [...existing.events, ...events] : events,
    tracks,
  };

  // 9. Validate before writing.
  const v = await validateTimeline(timeline);
  if (!v.ok) {
    console.error("Generated timeline failed schema validation:");
    for (const e of v.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  await writeTimeline(loomRoot.loomPath, args.asId, timeline);

  // 10. Report.
  console.log(
    `Wrote ${events.length} event${events.length === 1 ? "" : "s"} to ` +
      `${loomRoot.loomPath}/timelines/${args.asId}.timeline.json` +
      (existing ? ` (appended; total ${timeline.events.length})` : "")
  );
  if (skipped.length > 0) {
    console.log(
      `Skipped ${skipped.length} span${skipped.length === 1 ? "" : "s"} ` +
        `with no matching node. Pass --map mapping.json to override.`
    );
    const sample = skipped.slice(0, 5);
    for (const { span, reason } of sample) {
      console.log(`  • ${span.name}  (service=${span.serviceName ?? "—"})  ${reason}`);
    }
    if (skipped.length > sample.length) {
      console.log(`  … and ${skipped.length - sample.length} more.`);
    }
  }
}
