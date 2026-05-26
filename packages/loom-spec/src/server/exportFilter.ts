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
 *
 *  - Diagrams that end up empty are NOT dropped automatically — the caller
 *    decides (often via --diagram for explicit single-diagram exports).
 *    Empty diagrams still render an empty canvas, which is visible to the
 *    reader and gives them a clue something was filtered out.
 */

import type { LoomDiagram, Node as LoomNode } from "../types/diagram.js";
import type { LoomNodeTypes } from "../types/node-types.js";
import type { LoomJourney } from "../types/journey.js";

export interface FilterSpec {
  includeTags?: string[];
  excludeTags?: string[];
  /** When set, restrict nodes in this journey's referenced diagram to those
   *  the journey actually walks through. Other diagrams are unaffected by
   *  this restriction (they survive on tag rules alone). The journey-aware
   *  caller usually sets `--diagram` to the same diagram so the rest don't
   *  ship at all. */
  fromJourney?: { diagramId: string; nodeIds: Set<string> };
}

export interface LoomExportPayload {
  diagrams: Record<string, LoomDiagram>;
  journeys?: Record<string, LoomJourney>;
  nodeTypes: LoomNodeTypes;
}

export interface FilterResult {
  payload: LoomExportPayload;
  /** Summary, used by the CLI to print "Dropped N nodes, M edges, …". */
  summary: {
    nodesDropped: number;
    edgesDropped: number;
    groupsDropped: number;
    drillDownsCleared: number;
    journeyStepsDropped: number;
    journeysDropped: number;
  };
}

function nodeMatchesTags(node: LoomNode, spec: FilterSpec): boolean {
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

function nodeMatches(
  diagramId: string,
  node: LoomNode,
  spec: FilterSpec
): boolean {
  if (!nodeMatchesTags(node, spec)) return false;
  // Journey scoping: only applies to the journey's own diagram. Nodes in
  // other diagrams aren't affected by the journey filter (they're filtered
  // by tags alone, or implicitly dropped if --diagram narrows the export).
  if (
    spec.fromJourney &&
    spec.fromJourney.diagramId === diagramId &&
    !spec.fromJourney.nodeIds.has(node.id)
  ) {
    return false;
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
  const noNodeFilter =
    (spec.includeTags?.length ?? 0) === 0 &&
    (spec.excludeTags?.length ?? 0) === 0 &&
    !spec.fromJourney;

  let nodesDropped = 0;
  let edgesDropped = 0;
  let groupsDropped = 0;
  let drillDownsCleared = 0;
  let journeyStepsDropped = 0;
  let journeysDropped = 0;

  if (noNodeFilter && !payload.journeys) {
    return {
      payload,
      summary: {
        nodesDropped: 0,
        edgesDropped: 0,
        groupsDropped: 0,
        drillDownsCleared: 0,
        journeyStepsDropped: 0,
        journeysDropped: 0,
      },
    };
  }

  // First pass: filter each diagram's nodes / edges / groups.
  // Track surviving node ids per diagram so we can decide which drill_down
  // references stay valid.
  const filteredDiagrams: Record<string, LoomDiagram> = {};
  const survivingNodeIdsByDiagram: Record<string, Set<string>> = {};

  for (const [id, d] of Object.entries(payload.diagrams)) {
    const beforeNodes = d.nodes.length;
    const beforeEdges = d.edges.length;
    const beforeGroups = d.groups?.length ?? 0;

    const survivingNodes = noNodeFilter
      ? d.nodes
      : d.nodes.filter((n) => nodeMatches(id, n, spec));
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

  // Third pass: cascade into journeys. Prune steps whose node was dropped;
  // drop journeys whose diagram is empty or whose steps are all gone.
  const filteredJourneys: Record<string, LoomJourney> | undefined =
    payload.journeys ? {} : undefined;
  if (payload.journeys && filteredJourneys) {
    for (const [jid, j] of Object.entries(payload.journeys)) {
      const survivors = survivingNodeIdsByDiagram[j.diagram];
      // Diagram filtered out entirely (or wasn't in the export at all) →
      // drop the journey. Without nodes there's nothing to walk through.
      if (!survivors || survivors.size === 0) {
        journeysDropped++;
        continue;
      }
      const beforeSteps = j.steps.length;
      const survivingSteps = j.steps.filter((s) => survivors.has(s.node));
      journeyStepsDropped += beforeSteps - survivingSteps.length;
      if (survivingSteps.length === 0) {
        journeysDropped++;
        continue;
      }
      filteredJourneys[jid] = { ...j, steps: survivingSteps };
    }
  }

  return {
    payload: {
      diagrams: filteredDiagrams,
      journeys: filteredJourneys,
      nodeTypes: payload.nodeTypes,
    },
    summary: {
      nodesDropped,
      edgesDropped,
      groupsDropped,
      drillDownsCleared,
      journeyStepsDropped,
      journeysDropped,
    },
  };
}
