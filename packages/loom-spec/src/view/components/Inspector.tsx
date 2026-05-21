import type {
  Node as LoomNode,
  Edge as LoomEdge,
} from "../../types/diagram";
import type { LoomNodeTypes, Field, NodeType } from "../../types/node-types";

interface Props {
  selectedNode: LoomNode | null;
  selectedEdge: LoomEdge | null;
  nodeTypes: LoomNodeTypes;
  onUpdateNode: (id: string, updater: (n: LoomNode) => LoomNode) => void;
  onUpdateEdge: (id: string, updater: (e: LoomEdge) => LoomEdge) => void;
}

const STATUS_COLOR: Record<LoomNode["status"], string> = {
  planned: "var(--status-planned)",
  implemented: "var(--status-implemented)",
  stale: "var(--status-stale)",
  deprecated: "var(--status-deprecated)",
};

const STATUSES: LoomNode["status"][] = [
  "planned",
  "implemented",
  "stale",
  "deprecated",
];

const EDGE_KINDS: LoomEdge["kind"][] = [
  "request",
  "event",
  "data-read",
  "data-write",
  "signal",
  "dependency",
  "control",
];

export function Inspector(props: Props) {
  if (props.selectedNode) {
    return <NodeInspector {...props} node={props.selectedNode} />;
  }
  if (props.selectedEdge) {
    return <EdgeInspector {...props} edge={props.selectedEdge} />;
  }
  return (
    <div className="inspector">
      <div className="empty">Select a node or edge to inspect</div>
    </div>
  );
}

function NodeInspector({
  node,
  nodeTypes,
  onUpdateNode,
}: Props & { node: LoomNode }) {
  const typeDef: NodeType | undefined = nodeTypes.types[node.type];
  const typeColor = typeDef?.color ?? "#71717a";
  const properties = node.properties ?? {};
  const codeRefs = node.code_refs ?? [];

  const update = (updater: (n: LoomNode) => LoomNode) =>
    onUpdateNode(node.id, updater);

  const updateProp = (name: string, value: unknown) =>
    update((n) => ({
      ...n,
      properties: { ...(n.properties ?? {}), [name]: value },
    }));

  return (
    <div className="inspector">
      <span
        className="type-tag"
        style={{ background: typeColor, color: "#fff" }}
      >
        {typeDef?.label ?? node.type}
      </span>

      <div className="field">
        <div className="field-label">Label</div>
        <input
          className="input"
          value={node.label}
          onChange={(e) =>
            update((n) => ({ ...n, label: e.target.value }))
          }
        />
      </div>

      <div className="field">
        <div className="field-label">Status</div>
        <select
          className="input"
          value={node.status}
          onChange={(e) =>
            update((n) => ({
              ...n,
              status: e.target.value as LoomNode["status"],
            }))
          }
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div
          className="status-line"
          style={{ background: STATUS_COLOR[node.status] }}
        />
      </div>

      <div className="field">
        <div className="field-label">ID</div>
        <div className="field-value"><code>{node.id}</code></div>
      </div>

      <div className="field">
        <div className="field-label">Description</div>
        <textarea
          className="input textarea"
          rows={3}
          value={node.description ?? ""}
          placeholder="Markdown allowed"
          onChange={(e) =>
            update((n) => ({ ...n, description: e.target.value || undefined }))
          }
        />
      </div>

      {(typeDef?.fields ?? []).length > 0 && (
        <div className="field">
          <div className="field-label">Properties</div>
          {(typeDef?.fields ?? []).map((f) => (
            <PropertyField
              key={f.name}
              field={f}
              value={properties[f.name]}
              onChange={(v) => updateProp(f.name, v)}
            />
          ))}
        </div>
      )}

      <div className="field">
        <div className="field-label">Code refs</div>
        {codeRefs.length === 0 ? (
          <div className="field-value muted">none yet</div>
        ) : (
          codeRefs.map((ref, i) => (
            <div key={i} className="code-ref">
              {ref.path}
              {ref.symbol && (
                <span style={{ color: "var(--text-muted)" }}> · {ref.symbol}</span>
              )}
              {ref.lines && (
                <span style={{ color: "var(--text-muted)" }}> · L{ref.lines}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EdgeInspector({
  edge,
  onUpdateEdge,
}: Props & { edge: LoomEdge }) {
  const update = (updater: (e: LoomEdge) => LoomEdge) =>
    onUpdateEdge(edge.id, updater);

  return (
    <div className="inspector">
      <span
        className="type-tag"
        style={{ background: "#71717a", color: "#fff" }}
      >
        EDGE
      </span>

      <div className="field">
        <div className="field-label">From → To</div>
        <div className="field-value">
          <code>{edge.from}</code> → <code>{edge.to}</code>
        </div>
      </div>

      <div className="field">
        <div className="field-label">Kind</div>
        <select
          className="input"
          value={edge.kind}
          onChange={(e) =>
            update((g) => ({ ...g, kind: e.target.value as LoomEdge["kind"] }))
          }
        >
          {EDGE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <div className="field-label">Label</div>
        <input
          className="input"
          value={edge.label ?? ""}
          onChange={(e) =>
            update((g) => ({ ...g, label: e.target.value || undefined }))
          }
        />
      </div>

      <div className="field">
        <div className="field-label">Description</div>
        <textarea
          className="input textarea"
          rows={2}
          value={edge.description ?? ""}
          onChange={(e) =>
            update((g) => ({ ...g, description: e.target.value || undefined }))
          }
        />
      </div>
    </div>
  );
}

function PropertyField({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label
        style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0" }}
      >
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{field.name}</span>
      </label>
    );
  }

  if (field.type === "enum") {
    const values = (field.values ?? []) as string[];
    return (
      <div style={{ margin: "4px 0" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{field.name}</div>
        <select
          className="input"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">—</option>
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div style={{ margin: "4px 0" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{field.name}</div>
        <input
          className="input"
          type="number"
          value={(value as number) ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
        />
      </div>
    );
  }

  if (field.type === "markdown") {
    return (
      <div style={{ margin: "4px 0" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{field.name}</div>
        <textarea
          className="input textarea"
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      </div>
    );
  }

  // string, code-ref, array, fallback
  return (
    <div style={{ margin: "4px 0" }}>
      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{field.name}</div>
      <input
        className="input"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}
