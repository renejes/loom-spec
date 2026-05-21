import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { LoomNodeTypes } from "../../types/node-types";

interface Props {
  nodeTypes: LoomNodeTypes;
  anchorRef: RefObject<HTMLElement | null>;
  onPick: (typeKey: string) => void;
  onClose: () => void;
}

interface Position {
  top: number;
  right: number;
}

export function AddNodeMenu({ nodeTypes, anchorRef, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  // Position the menu immediately below the anchor button, right-aligned.
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
      <div className="add-node-menu-title">Add node</div>
      {Object.entries(nodeTypes.types).map(([key, t]) => (
        <button
          key={key}
          className="add-node-item"
          onClick={() => onPick(key)}
          style={{ ["--node-color" as string]: t.color }}
        >
          <span className="add-node-color" />
          <div className="add-node-text">
            <div className="add-node-label">{t.label}</div>
            <code className="add-node-key">{key}</code>
          </div>
        </button>
      ))}
    </div>
  );
}
