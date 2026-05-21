import { useEffect, useRef } from "react";
import type { LoomNodeTypes } from "../../types/node-types";

interface Props {
  nodeTypes: LoomNodeTypes;
  onPick: (typeKey: string) => void;
  onClose: () => void;
}

export function AddNodeMenu({ nodeTypes, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div className="add-node-menu" ref={ref}>
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
