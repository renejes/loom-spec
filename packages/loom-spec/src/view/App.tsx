import { useCallback, useState } from "react";
import { TopBar } from "./components/TopBar";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { Inspector } from "./components/Inspector";
import { AddNodeMenu } from "./components/AddNodeMenu";
import { useDiagramState, uniqueNodeId } from "./state";
import type { Node as LoomNode } from "../types/diagram";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

export function App() {
  const state = useDiagramState("overview");
  const [selection, setSelection] = useState<Selection>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

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
        title={state.diagram.title}
        subtitle={state.diagram.description}
        saveStatus={state.saveStatus}
        saveError={state.saveError}
        onClickAdd={() => setAddMenuOpen((v) => !v)}
        addMenuOpen={addMenuOpen}
      />
      {addMenuOpen && (
        <AddNodeMenu
          nodeTypes={state.nodeTypes}
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
