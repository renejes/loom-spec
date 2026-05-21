import type { TimelineEvent } from "../../types/timeline";
import type { LoomDiagram } from "../../types/diagram";

interface Props {
  selectedEvent: TimelineEvent | null;
  diagram: LoomDiagram;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function TimelineInspector({ selectedEvent, diagram }: Props) {
  if (!selectedEvent) {
    return (
      <div className="inspector">
        <div className="empty">Click a clip to inspect</div>
      </div>
    );
  }

  const node = diagram.nodes.find((n) => n.id === selectedEvent.node);
  const codeRefs = selectedEvent.code_refs ?? [];
  const tags = selectedEvent.tags ?? [];

  return (
    <div className="inspector">
      <span
        className="type-tag"
        style={{ background: "#71717a", color: "#fff" }}
      >
        EVENT
      </span>

      {selectedEvent.label && <h2>{selectedEvent.label}</h2>}

      <div className="field">
        <div className="field-label">Node</div>
        <div className="field-value">
          <code>{selectedEvent.node}</code>
          {node && (
            <span style={{ color: "var(--text-muted)" }}> · {node.label}</span>
          )}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Timing</div>
        <div className="field-value">
          starts {fmtMs(selectedEvent.start_ms)} ·{" "}
          lasts {fmtMs(selectedEvent.duration_ms)}
        </div>
      </div>

      {selectedEvent.kind && (
        <div className="field">
          <div className="field-label">Kind</div>
          <div className="field-value">{selectedEvent.kind}</div>
        </div>
      )}

      {selectedEvent.track && (
        <div className="field">
          <div className="field-label">Track</div>
          <div className="field-value">
            <code>{selectedEvent.track}</code>
          </div>
        </div>
      )}

      {selectedEvent.triggered_by && (
        <div className="field">
          <div className="field-label">Triggered by</div>
          <div className="field-value">
            <code>{selectedEvent.triggered_by}</code>
          </div>
        </div>
      )}

      {selectedEvent.description && (
        <div className="field">
          <div className="field-label">Description</div>
          <div className="field-value">{selectedEvent.description}</div>
        </div>
      )}

      {codeRefs.length > 0 && (
        <div className="field">
          <div className="field-label">Code refs</div>
          {codeRefs.map((ref, i) => (
            <div key={i} className="code-ref">
              {ref.path}
              {ref.symbol && (
                <span style={{ color: "var(--text-muted)" }}> · {ref.symbol}</span>
              )}
              {ref.lines && (
                <span style={{ color: "var(--text-muted)" }}> · L{ref.lines}</span>
              )}
            </div>
          ))}
        </div>
      )}

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

      <div className="field">
        <div className="field-label">ID</div>
        <div className="field-value">
          <code>{selectedEvent.id}</code>
        </div>
      </div>
    </div>
  );
}
