import type { Node as LoomNode } from "../../types/diagram";
import type { NodeType } from "../../types/node-types";

interface Props {
  node: LoomNode | null;
  typeDef: NodeType | undefined;
}

const STATUS_COLOR: Record<LoomNode["status"], string> = {
  planned: "var(--status-planned)",
  implemented: "var(--status-implemented)",
  stale: "var(--status-stale)",
  deprecated: "var(--status-deprecated)",
};

export function Inspector({ node, typeDef }: Props) {
  if (!node) {
    return (
      <div className="inspector">
        <div className="empty">Select a node to inspect</div>
      </div>
    );
  }

  const typeColor = typeDef?.color ?? "#71717a";
  const properties = node.properties ?? {};
  const codeRefs = node.code_refs ?? [];
  const tags = node.tags ?? [];

  return (
    <div className="inspector">
      <span
        className="type-tag"
        style={{ background: typeColor, color: "#fff" }}
      >
        {typeDef?.label ?? node.type}
      </span>
      <h2>{node.label}</h2>

      <div className="field">
        <div className="field-label">Status</div>
        <div className="field-value">
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATUS_COLOR[node.status],
              marginRight: 6,
              verticalAlign: "middle",
            }}
          />
          {node.status}
        </div>
      </div>

      <div className="field">
        <div className="field-label">ID</div>
        <div className="field-value"><code>{node.id}</code></div>
      </div>

      {node.description && (
        <div className="field">
          <div className="field-label">Description</div>
          <div className="field-value">{node.description}</div>
        </div>
      )}

      {Object.keys(properties).length > 0 && (
        <div className="field">
          <div className="field-label">Properties</div>
          {Object.entries(properties).map(([k, v]) => (
            <div key={k} className="field-value" style={{ display: "flex", gap: 8 }}>
              <code style={{ color: "var(--text-muted)" }}>{k}:</code>
              <span>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="field">
        <div className="field-label">Code refs</div>
        {codeRefs.length === 0 ? (
          <div className="field-value muted">none</div>
        ) : (
          codeRefs.map((ref, i) => (
            <div key={i} className="code-ref">
              {ref.path}
              {ref.symbol && <span style={{ color: "var(--text-muted)" }}> · {ref.symbol}</span>}
              {ref.lines && <span style={{ color: "var(--text-muted)" }}> · L{ref.lines}</span>}
            </div>
          ))
        )}
      </div>

      {tags.length > 0 && (
        <div className="field">
          <div className="field-label">Tags</div>
          <div>
            {tags.map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        </div>
      )}

      {node.drill_down && (
        <div className="field">
          <div className="field-label">Drill down</div>
          <div className="field-value"><code>{node.drill_down}</code></div>
        </div>
      )}
    </div>
  );
}
