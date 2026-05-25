import { useState } from "react";
import { X, Plus } from "lucide-react";
import type {
  Node as LoomNode,
  Edge as LoomEdge,
  CodeRef,
} from "../../types/diagram";
import type { LoomNodeTypes, Field, NodeType } from "../../types/node-types";
import {
  errorsForEdge,
  errorsForNode,
  type ValidationError,
} from "../validate-client";

interface Props {
  selectedNode: LoomNode | null;
  selectedEdge: LoomEdge | null;
  nodeTypes: LoomNodeTypes;
  validationErrors: ValidationError[];
  /** Pass `undefined` for read-only mode (exported HTML). Inputs render but
   *  edits are dropped silently. */
  onUpdateNode?: (id: string, updater: (n: LoomNode) => LoomNode) => void;
  onUpdateEdge?: (id: string, updater: (e: LoomEdge) => LoomEdge) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="field-error">{message}</div>;
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
  validationErrors,
  onUpdateNode,
}: Props & { node: LoomNode }) {
  const typeDef: NodeType | undefined = nodeTypes.types[node.type];
  const typeColor = typeDef?.color ?? "#71717a";
  const properties = node.properties ?? {};
  const codeRefs = node.code_refs ?? [];
  const tags = node.tags ?? [];
  const errors = errorsForNode(validationErrors, node.id);

  const update = (updater: (n: LoomNode) => LoomNode) => {
    onUpdateNode?.(node.id, updater);
  };

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
        <FieldError message={errors.label} />
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
        <FieldError message={errors.id} />
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
        <FieldError message={errors.description} />
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
        <FieldError message={errors.code_refs} />
        {codeRefs.map((ref, i) => (
          <div key={i} className="code-ref-row">
            <input
              className="input"
              value={ref.path}
              placeholder="src/path/to/file.ts"
              onChange={(e) =>
                update((n) => {
                  const next = [...(n.code_refs ?? [])];
                  next[i] = { ...next[i], path: e.target.value } as CodeRef;
                  return { ...n, code_refs: next };
                })
              }
            />
            <input
              className="input small"
              value={ref.symbol ?? ""}
              placeholder="symbol"
              onChange={(e) =>
                update((n) => {
                  const next = [...(n.code_refs ?? [])];
                  next[i] = { ...next[i], symbol: e.target.value || undefined } as CodeRef;
                  return { ...n, code_refs: next };
                })
              }
            />
            <input
              className="input small"
              value={ref.lines ?? ""}
              placeholder="lines"
              onChange={(e) =>
                update((n) => {
                  const next = [...(n.code_refs ?? [])];
                  next[i] = { ...next[i], lines: e.target.value || undefined } as CodeRef;
                  return { ...n, code_refs: next };
                })
              }
            />
            <button
              type="button"
              className="row-delete"
              title="Remove ref"
              aria-label="Remove ref"
              onClick={() =>
                update((n) => ({
                  ...n,
                  code_refs: (n.code_refs ?? []).filter((_, j) => j !== i),
                }))
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="add-row"
          onClick={() =>
            update((n) => ({
              ...n,
              code_refs: [...(n.code_refs ?? []), { path: "" }],
            }))
          }
        >
          <Plus size={12} /> Add code ref
        </button>
      </div>

      <div className="field">
        <div className="field-label">Tags</div>
        <TagInput
          value={tags}
          onChange={(next) =>
            update((n) => ({ ...n, tags: next.length > 0 ? next : undefined }))
          }
        />
      </div>
    </div>
  );
}

function EdgeInspector({
  edge,
  validationErrors,
  onUpdateEdge,
}: Props & { edge: LoomEdge }) {
  const update = (updater: (e: LoomEdge) => LoomEdge) => {
    onUpdateEdge?.(edge.id, updater);
  };
  const errors = errorsForEdge(validationErrors, edge.id);

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
        <FieldError message={errors.from ?? errors.to} />
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
        <FieldError message={errors.kind} />
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
        <FieldError message={errors.label} />
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

function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const t = draft.trim().toLowerCase();
    setDraft("");
    if (!t) return;
    if (value.includes(t)) return;
    onChange([...value, t]);
  };

  return (
    <div className="tag-input">
      <div className="tag-chips">
        {value.map((t) => (
          <span key={t} className="tag">
            {t}
            <button
              type="button"
              className="tag-x"
              aria-label={`Remove tag ${t}`}
              onClick={() => onChange(value.filter((x) => x !== t))}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <input
        className="input"
        value={draft}
        placeholder="Add tag and press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
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
