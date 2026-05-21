import { useEffect, useState } from "react";
import { TopBar } from "./components/TopBar";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { Inspector } from "./components/Inspector";
import { loadDiagram, type LoadedSpec } from "./loadDiagram";
import type { Node as LoomNode } from "../types/diagram";

export function App() {
  const [spec, setSpec] = useState<LoadedSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LoomNode | null>(null);

  useEffect(() => {
    loadDiagram()
      .then(setSpec)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="app">
        <div className="topbar">
          <div className="title">loom-spec</div>
        </div>
        <div className="canvas-wrap" style={{ padding: 24 }}>
          <code style={{ color: "var(--status-stale)" }}>Failed to load: {error}</code>
        </div>
        <div className="inspector"><div className="empty">—</div></div>
      </div>
    );
  }

  if (!spec) {
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

  const selectedTypeDef = selected
    ? spec.nodeTypes.types[selected.type]
    : undefined;

  return (
    <div className="app">
      <TopBar
        title={spec.diagram.title}
        subtitle={spec.diagram.description}
      />
      <DiagramCanvas
        diagram={spec.diagram}
        nodeTypesConfig={spec.nodeTypes}
        onSelectNode={setSelected}
      />
      <Inspector node={selected} typeDef={selectedTypeDef} />
    </div>
  );
}
