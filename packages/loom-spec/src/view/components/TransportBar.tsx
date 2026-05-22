import type { ReactNode } from "react";
import { Play, Pause, SkipBack } from "lucide-react";

interface Props {
  playing: boolean;
  positionMs: number;
  totalMs: number;
  speed: number;
  onPlayPause: () => void;
  onReset: () => void;
  onSpeed: (s: number) => void;
  /** Optional content rendered after the position readout, before the
   *  right-side spacer. Used for things like an "+ Event" button that
   *  the timeline view owns. */
  actions?: ReactNode;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

function fmt(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function TransportBar({
  playing,
  positionMs,
  totalMs,
  speed,
  onPlayPause,
  onReset,
  onSpeed,
  actions,
}: Props) {
  return (
    <div className="transport-bar">
      <button
        className="transport-btn"
        onClick={onPlayPause}
        title={playing ? "Pause (space)" : "Play (space)"}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button
        className="transport-btn"
        onClick={onReset}
        title="Reset to 0 (home)"
        aria-label="Reset"
      >
        <SkipBack size={14} />
      </button>
      <div className="transport-position">
        <code>{fmt(positionMs)}</code>
        <span className="muted"> / {fmt(totalMs)}</span>
      </div>
      {actions}
      <div className="transport-spacer" />
      <label className="transport-speed">
        <span className="muted">Speed</span>
        <select
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
