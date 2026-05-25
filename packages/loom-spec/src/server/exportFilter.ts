/**
 * Tag-based filter for HTML exports. Used by `loom-spec export-html` to
 * produce scoped bundles (public manual, ops runbook, etc.) from the same
 * `.loom/` source.
 *
 * Semantics:
 *
 *  - A node "matches" iff
 *      (includeTags is empty OR node has at least one matching include tag)
 *      AND
 *      (excludeTags is empty OR node has none of the exclude tags)
 *
 *    If both lists are empty the filter is a no-op (all nodes match).
 *
 *  - Cascade rules (applied in order, so later rules see post-filter state):
 *      1. Drop nodes that don't match.
 *      2. Drop edges whose source or target node was dropped.
 *      3. Drop or shrink groups: if any group's `children` are all dropped,
 *         drop the group; otherwise keep with surviving children.
 *      4. Null out `drill_down` chevrons that target diagrams with zero
 *         surviving nodes after filtering.
 *      5. Drop timeline events whose referenced node was dropped.
 *      6. Drop timelines that end up with zero events.
 *      7. Null out `triggered_by` refs pointing at dropped events.
 *
 *  - Diagrams that end up empty are NOT dropped automatically — the caller
 *    decides (often via --diagram for explicit single-diagram exports).
 *    Empty diagrams still render an empty canvas, which is visible to the
 *    reader and gives them a clue something was filtered out.
 */

import type { LoomDiagram, Node as LoomNode } from "../types/diagram.js";
import type { LoomTimeline, TimelineEvent } from "../types/timeline.js";
import type { LoomNodeTypes } from "../types/node-types.js";

export interface FilterSpec {
  includeTags?: string[];
  excludeTags?: string[];
}

export interface LoomExportPayload {
  diagrams: Record<string, LoomDiagram>;
  timelines: Record<string, LoomTimeline>;
  nodeTypes: LoomNodeTypes;
}

export interface FilterResult {
  payload: LoomExportPayload;
  /** Summary, used by the CLI to print "Dropped N nodes, M edges, …". */
  summary: {
    nodesDropped: number;
    edgesDropped: number;
    groupsDropped: number;
    eventsDropped: number;
    timelinesDropped: number;
    drillDownsCleared: number;
  };
}

function nodeMatches(node: LoomNode, spec: FilterSpec): boolean {
  const tags = node.tags ?? [];
  const includes = spec.includeTags ?? [];
  const excludes = spec.excludeTags ?? [];
  if (includes.length > 0) {
    if (!includes.some((t) => tags.includes(t))) return false;
  }
  if (excludes.length > 0) {
    if (excludes.some((t) => tags.includes(t))) return false;
  }
  return true;
}

/**
 * Apply the filter cascade. Returns a deep-enough copy that mutating the
 * result doesn't mutate the input.
 */
export function applyFilter(
  payload: LoomExportPayload,
  spec: FilterSpec
): FilterResult {
  const noFilter =
    (spec.includeTags?.length ?? 0) === 0 &&
    (spec.excludeTags?.length ?? 0) === 0;
  if (noFilter) {
    return {
      payload,
      summary: {
        nodesDropped: 0,
        edgesDropped: 0,
        groupsDropped: 0,
        eventsDropped: 0,
        timelinesDropped: 0,
        drillDownsCleared: 0,
      },
    };
  }

  let nodesDropped = 0;
  let edgesDropped = 0;
  let groupsDropped = 0;
  let eventsDropped = 0;
  let timelinesDropped = 0;
  let drillDownsCleared = 0;

  // First pass: filter each diagram's nodes / edges / groups.
  // Track surviving node ids per diagram so we can decide which timelines
  // and drill_down references stay valid.
  const filteredDiagrams: Record<string, LoomDiagram> = {};
  const survivingNodeIdsByDiagram: Record<string, Set<string>> = {};

  for (const [id, d] of Object.entries(payload.diagrams)) {
    const beforeNodes = d.nodes.length;
    const beforeEdges = d.edges.length;
    const beforeGroups = d.groups?.length ?? 0;

    const survivingNodes = d.nodes.filter((n) => nodeMatches(n, spec));
    const survivingIds = new Set(survivingNodes.map((n) => n.id));
    survivingNodeIdsByDiagram[id] = survivingIds;

    const survivingEdges = d.edges.filter((e) => {
      const fromId = e.from.split(":")[0]!;
      const toId = e.to.split(":")[0]!;
      return survivingIds.has(fromId) && survivingIds.has(toId);
    });

    const survivingGroups = (d.groups ?? [])
      .map((g) => ({
        ...g,
        children: (g.children ?? []).filter((cid) => survivingIds.has(cid)),
      }))
      .filter((g) => g.children.length > 0);

    nodesDropped += beforeNodes - survivingNodes.length;
    edgesDropped += beforeEdges - survivingEdges.length;
    groupsDropped += beforeGroups - survivingGroups.length;

    filteredDiagrams[id] = {
      ...d,
      nodes: survivingNodes,
      edges: survivingEdges,
      groups: survivingGroups.length > 0 ? survivingGroups : undefined,
    };
  }

  // Second pass: scrub drill_down refs pointing at fully-empty diagrams.
  for (const d of Object.values(filteredDiagrams)) {
    d.nodes = d.nodes.map((n) => {
      if (!n.drill_down) return n;
      const targetSurvivors = survivingNodeIdsByDiagram[n.drill_down];
      // Target diagram missing OR empty after filter → drop chevron.
      if (!targetSurvivors || targetSurvivors.size === 0) {
        drillDownsCleared++;
        const { drill_down: _drop, ...rest } = n;
        return rest as LoomNode;
      }
      return n;
    });
    if (d.groups) {
      d.groups = d.groups.map((g) => {
        if (!g.drill_down) return g;
        const targetSurvivors = survivingNodeIdsByDiagram[g.drill_down];
        if (!targetSurvivors || targetSurvivors.size === 0) {
          drillDownsCleared++;
          const { drill_down: _drop, ...rest } = g;
          return rest as typeof g;
        }
        return g;
      });
    }
  }

  // Third pass: filter timelines. Drop events on filtered nodes; drop the
  // whole timeline if it ends up empty; scrub dangling triggered_by refs.
  const filteredTimelines: Record<string, LoomTimeline> = {};
  for (const [id, tl] of Object.entries(payload.timelines)) {
    const survivingIds = survivingNodeIdsByDiagram[tl.diagram];
    if (!survivingIds || survivingIds.size === 0) {
      // Underlying diagram fully filtered → drop timeline.
      timelinesDropped++;
      eventsDropped += tl.events.length;
      continue;
    }
    const beforeEvents = tl.events.length;
    const survivingEvents = tl.events.filter((e) => survivingIds.has(e.node));
    eventsDropped += beforeEvents - survivingEvents.length;
    if (survivingEvents.length === 0) {
      timelinesDropped++;
      continue;
    }
    const survivingEventIds = new Set(survivingEvents.map((e) => e.id));
    const scrubbed: TimelineEvent[] = survivingEvents.map((e) =>
      e.triggered_by && !survivingEventIds.has(e.triggered_by)
        ? { ...e, triggered_by: undefined }
        : e
    );
    filteredTimelines[id] = { ...tl, events: scrubbed };
  }

  return {
    payload: {
      diagrams: filteredDiagrams,
      timelines: filteredTimelines,
      nodeTypes: payload.nodeTypes,
    },
    summary: {
      nodesDropped,
      edgesDropped,
      groupsDropped,
      eventsDropped,
      timelinesDropped,
      drillDownsCleared,
    },
  };
}
