/**
 * Edge wiring validation against the node-type port vocabulary.
 *
 * Three checks, none of which the JSON schema can express:
 *   1. unknown-node    — an edge endpoint references a node id that
 *                        doesn't exist in the diagram (error).
 *   2. unknown-port    — an edge uses `node:port` but the node's type
 *                        doesn't declare that port (error). Source uses
 *                        an out-port, target uses an in-port.
 *   3. signal-mismatch — both endpoints are typed ports whose signal
 *                        types differ, e.g. audio_out → midi_in. Almost
 *                        always a wiring bug, but flagged as a WARNING
 *                        since some cross-type connections are intentional
 *                        (e.g. cv modulation into an audio-rate input).
 *
 * Pure functions. Only checks ports when both sides declare a signal —
 * untyped ports skip the signal check (no false positives).
 */
import type { LoomDiagram, Edge as LoomEdge } from "../types/diagram.js";
import type { LoomNodeTypes } from "../types/node-types.js";

export type WiringIssue =
  | { kind: "unknown-node"; endpoint: "from" | "to"; node: string }
  | { kind: "unknown-port"; endpoint: "from" | "to"; node: string; port: string }
  | { kind: "signal-mismatch"; fromSignal: string; toSignal: string };

export interface WiringFinding {
  edgeId: string;
  issue: WiringIssue;
  detail: string;
  severity: "error" | "warning";
}

function splitHandle(handle: string): { node: string; port: string | null } {
  const i = handle.indexOf(":");
  if (i === -1) return { node: handle, port: null };
  return { node: handle.slice(0, i), port: handle.slice(i + 1) };
}

export function validateEdgeWiring(
  edge: LoomEdge,
  diagram: LoomDiagram,
  nodeTypes: LoomNodeTypes
): WiringFinding[] {
  const findings: WiringFinding[] = [];
  const from = splitHandle(edge.from);
  const to = splitHandle(edge.to);
  const nodesById = new Map(diagram.nodes.map((n) => [n.id, n] as const));

  const fromNode = nodesById.get(from.node);
  const toNode = nodesById.get(to.node);

  if (!fromNode) {
    findings.push({
      edgeId: edge.id,
      issue: { kind: "unknown-node", endpoint: "from", node: from.node },
      detail: `source node '${from.node}' does not exist in this diagram`,
      severity: "error",
    });
  }
  if (!toNode) {
    findings.push({
      edgeId: edge.id,
      issue: { kind: "unknown-node", endpoint: "to", node: to.node },
      detail: `target node '${to.node}' does not exist in this diagram`,
      severity: "error",
    });
  }

  // Resolve port signal types (and validate port existence) for each side.
  let fromSignal: string | null = null;
  let toSignal: string | null = null;

  if (fromNode && from.port) {
    const outPorts = nodeTypes.types[fromNode.type]?.ports?.out ?? [];
    const p = outPorts.find((pp) => pp.name === from.port);
    if (!p) {
      findings.push({
        edgeId: edge.id,
        issue: { kind: "unknown-port", endpoint: "from", node: from.node, port: from.port },
        detail: `node '${from.node}' (type '${fromNode.type}') has no out-port '${from.port}'`,
        severity: "error",
      });
    } else {
      fromSignal = p.signal ?? null;
    }
  }

  if (toNode && to.port) {
    const inPorts = nodeTypes.types[toNode.type]?.ports?.in ?? [];
    const p = inPorts.find((pp) => pp.name === to.port);
    if (!p) {
      findings.push({
        edgeId: edge.id,
        issue: { kind: "unknown-port", endpoint: "to", node: to.node, port: to.port },
        detail: `node '${to.node}' (type '${toNode.type}') has no in-port '${to.port}'`,
        severity: "error",
      });
    } else {
      toSignal = p.signal ?? null;
    }
  }

  if (fromSignal && toSignal && fromSignal !== toSignal) {
    findings.push({
      edgeId: edge.id,
      issue: { kind: "signal-mismatch", fromSignal, toSignal },
      detail: `signal mismatch: '${fromSignal}' out → '${toSignal}' in (likely a wiring bug; tag the connection intentional if not)`,
      severity: "warning",
    });
  }

  return findings;
}
