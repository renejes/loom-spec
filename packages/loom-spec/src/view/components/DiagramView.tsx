import { useCallback, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { DiagramCanvas } from "./DiagramCanvas";
import { Inspector } from "./Inspector";
import { AddNodeMenu } from "./AddNodeMenu";
import { useDiagramState, uniqueNodeId } from "../state";
import { createEmptyDiagram } from "../loadDiagram";
import { isExportMode } from "../exportMode";
import { computeNewNodePosition } from "../../layout";
import type { DiagramSummary } from "../loadDiagram";
import type { JourneySummary } from "../loadJourney";
import type { Node as LoomNode } from "../../types/diagram";
import type { ViewState } from "../useViewState";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

interface Props {
  id: string;
  diagrams: DiagramSummary[];
  journeys?: JourneySummary[];
  refreshDiagrams: () => void;
  isDefault: boolean;
  onClickHome: () => void;
  onNavigate: (view: ViewState) => void;
}

export function DiagramView({
  id,
  diagrams,
  journeys,
  refreshDiagrams,
  isDefault,
  onClickHome,
  onNavigate,
}: Props) {
  const state = useDiagramState(id);
  const [selection, setSelection] = useState<Selection>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const exportMode = isExportMode();

  // Reset selection / close menus on navigation so the inspector doesn't
  // hold onto an id that no longer exists in the new diagram.
  const navigateAndReset = useCallback(
    (view: ViewState) => {
      setSelection(null);
      setAddMenuOpen(false);
      onNavigate(view);
    },
    [onNavigate]
  );

  const handleCreateDiagram = useCallback(async () => {
    const rawId = window.prompt(
      "New diagram id (lowercase letters, digits, hyphens):",
      ""
    );
    if (rawId === null) return;
    const newId = rawId.trim();
    if (!newId) return;
    if (!/^[a-z0-9-]+$/.test(newId)) {
      window.alert("Invalid id. Use lowercase letters, digits, and hyphens only.");
      return;
    }
    if (diagrams.some((d) => d.id === newId)) {
      window.alert(`A diagram with id "${newId}" already exists.`);
      return;
    }
    const title =
      window.prompt(
        "Title:",
        newId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      ) ?? newId;
    try {
      await createEmptyDiagram(newId, title);
      refreshDiagrams();
      navigateAndReset({ kind: "diagram", id: newId });
    } catch (e) {
      window.alert(
        `Failed to create diagram: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, [diagrams, refreshDiagrams, navigateAndReset]);

  const handleAddNode = useCallback(
    (typeKey: string) => {
      if (!state.diagram) return;
      const newId = uniqueNodeId(state.diagram, typeKey);
      const node: LoomNode = {
        id: newId,
        type: typeKey,
        label: "Untitled",
        position: computeNewNodePosition(state.diagram),
        status: "planned",
        code_refs: [],
        properties: {},
      };
      state.addNode(node);
      setSelection({ kind: "node", id: newId });
      setAddMenuOpen(false);
    },
    [state]
  );

  if (state.loadError) {
    return (
      <div className="app">
        <div className="topbar"><div className="title">loom-spec</div></div>
        <div className="canvas-wrap" style={{ padding: 24 }}>
          <code style={{ color: "var(--status-stale)" }}>
            Failed to load: {state.loadError}
          </code>
        </div>
        <div className="inspector"><div className="empty">—</div></div>
      </div>
    );
  }

  if (!state.diagram || !state.nodeTypes) {
    return (
      <div className="app">
        <div className="topbar"><div className="title">loom-spec</div></div>
        <div className="canvas-wrap" style={{ padding: 24, color: "var(--text-muted)" }}>
          Loading…
        </div>
        <div className="inspector"><div className="empty">—</div></div>
      </div>
    );
  }

  const selectedNode =
    selection?.kind === "node"
      ? state.diagram.nodes.find((n) => n.id === selection.id) ?? null
      : null;
  const selectedEdge =
    selection?.kind === "edge"
      ? state.diagram.edges.find((e) => e.id === selection.id) ?? null
      : null;

  return (
    <div className="app">
      <TopBar
        viewKind="diagram"
        viewId={id}
        title={state.diagram.title}
        subtitle={state.diagram.description}
        diagrams={diagrams}
        journeys={journeys}
        saveStatus={state.saveStatus}
        saveError={state.saveError}
        connectionStatus={state.connectionStatus}
        validationErrorCount={state.validationErrors.length}
        onClickAdd={() => setAddMenuOpen((v) => !v)}
        addMenuOpen={addMenuOpen}
        isDefault={isDefault}
        onClickHome={onClickHome}
        onNavigate={navigateAndReset}
        onCreateDiagram={exportMode ? undefined : handleCreateDiagram}
        addButtonRef={addButtonRef}
        hideAddButton={exportMode}
      />
      {addMenuOpen && !exportMode && (
        <AddNodeMenu
          nodeTypes={state.nodeTypes}
          anchorRef={addButtonRef}
          onPick={handleAddNode}
          onClose={() => setAddMenuOpen(false)}
        />
      )}
      <DiagramCanvas
        diagram={state.diagram}
        nodeTypesConfig={state.nodeTypes}
        selection={selection}
        onSelect={setSelection}
        onMoveNode={
          exportMode
            ? undefined
            : (nodeId, position) =>
                state.updateNode(nodeId, (n) => ({ ...n, position }))
        }
        onDeleteNode={
          exportMode
            ? undefined
            : (nodeId) => {
                state.deleteNode(nodeId);
                if (selection?.kind === "node" && selection.id === nodeId)
                  setSelection(null);
              }
        }
        onDeleteEdge={
          exportMode
            ? undefined
            : (edgeId) => {
                state.deleteEdge(edgeId);
                if (selection?.kind === "edge" && selection.id === edgeId)
                  setSelection(null);
              }
        }
        onAddEdge={exportMode ? undefined : state.addEdge}
        onDrillDown={(diagramId) =>
          navigateAndReset({ kind: "diagram", id: diagramId })
        }
        interactive={!exportMode}
      />
      <Inspector
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        nodeTypes={state.nodeTypes}
        validationErrors={state.validationErrors}
        onUpdateNode={exportMode ? undefined : state.updateNode}
        onUpdateEdge={exportMode ? undefined : state.updateEdge}
      />
    </div>
  );
}
