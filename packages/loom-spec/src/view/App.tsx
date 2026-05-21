import { useCallback, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { Inspector } from "./components/Inspector";
import { AddNodeMenu } from "./components/AddNodeMenu";
import { useDiagramState, uniqueNodeId } from "./state";
import { useDiagramId } from "./useDiagramId";
import { useDiagramsList } from "./useDiagramsList";
import { createEmptyDiagram } from "./loadDiagram";
import type { Node as LoomNode } from "../types/diagram";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

export function App() {
  const { id: diagramId, navigate, isDefault } = useDiagramId();
  const state = useDiagramState(diagramId);
  const { diagrams, refresh: refreshDiagrams } = useDiagramsList();
  const [selection, setSelection] = useState<Selection>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Reset selection whenever we switch diagrams so the inspector doesn't
  // hold onto an id that no longer exists.
  const navigateAndReset = useCallback(
    (id: string) => {
      setSelection(null);
      setAddMenuOpen(false);
      navigate(id);
    },
    [navigate]
  );

  const handleCreateDiagram = useCallback(async () => {
    const rawId = window.prompt(
      "New diagram id (lowercase letters, digits, hyphens):",
      ""
    );
    if (rawId === null) return;
    const id = rawId.trim();
    if (!id) return;
    if (!/^[a-z0-9-]+$/.test(id)) {
      window.alert(
        "Invalid id. Use lowercase letters, digits, and hyphens only."
      );
      return;
    }
    if (diagrams.some((d) => d.id === id)) {
      window.alert(`A diagram with id "${id}" already exists.`);
      return;
    }
    const title =
      window.prompt("Title:", id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())) ??
      id;
    try {
      await createEmptyDiagram(id, title);
      refreshDiagrams();
      navigateAndReset(id);
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
        position: { x: 200, y: 200 },
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
        diagramId={diagramId}
        title={state.diagram.title}
        subtitle={state.diagram.description}
        diagrams={diagrams}
        saveStatus={state.saveStatus}
        saveError={state.saveError}
        connectionStatus={state.connectionStatus}
        onClickAdd={() => setAddMenuOpen((v) => !v)}
        addMenuOpen={addMenuOpen}
        isDefault={isDefault}
        onClickHome={() => navigateAndReset("overview")}
        onNavigate={navigateAndReset}
        onCreateDiagram={handleCreateDiagram}
        addButtonRef={addButtonRef}
      />
      {addMenuOpen && (
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
        onMoveNode={(id, position) =>
          state.updateNode(id, (n) => ({ ...n, position }))
        }
        onDeleteNode={(id) => {
          state.deleteNode(id);
          if (selection?.kind === "node" && selection.id === id) setSelection(null);
        }}
        onDeleteEdge={(id) => {
          state.deleteEdge(id);
          if (selection?.kind === "edge" && selection.id === id) setSelection(null);
        }}
        onAddEdge={state.addEdge}
        onDrillDown={navigateAndReset}
      />
      <Inspector
        selectedNode={selectedNode}
        selectedEdge={selectedEdge}
        nodeTypes={state.nodeTypes}
        onUpdateNode={state.updateNode}
        onUpdateEdge={state.updateEdge}
      />
    </div>
  );
}
