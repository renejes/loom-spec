import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { LoomDiagram } from "../../types/diagram";
import type { LoomNodeTypes } from "../../types/node-types";

interface Props {
  diagram: LoomDiagram;
  nodeTypes: LoomNodeTypes;
  anchorRef: RefObject<HTMLElement | null>;
  onPick: (nodeId: string) => void;
  onClose: () => void;
}

interface Position {
  top: number;
  right: number;
}

export function AddEventMenu({
  diagram,
  nodeTypes,
  anchorRef,
  onPick,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    function place() {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      setPosition({
        top: r.bottom + 6,
        right: Math.max(8, window.innerWidth - r.right),
      });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchorRef]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (anchorRef.current?.contains(e.target as Node)) return;
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, anchorRef]);

  if (!position) return null;

  return (
    <div
      className="add-node-menu"
      ref={ref}
      style={{ top: position.top, right: position.right }}
    >
      <div className="add-node-menu-title">Add event on…</div>
      {diagram.nodes.length === 0 ? (
        <div className="switcher-empty">No nodes in this diagram</div>
      ) : (
        diagram.nodes.map((n) => {
          const t = nodeTypes.types[n.type];
          const color = t?.color ?? "#71717a";
          return (
            <button
              key={n.id}
              className="add-node-item"
              onClick={() => onPick(n.id)}
              style={{ ["--node-color" as string]: color }}
            >
              <span className="add-node-color" />
              <div className="add-node-text">
                <div className="add-node-label">{n.label}</div>
                <code className="add-node-key">{n.id}</code>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
