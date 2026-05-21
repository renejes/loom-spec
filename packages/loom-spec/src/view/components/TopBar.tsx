import { Moon, Sun, Plus, Check, Loader2, AlertCircle } from "lucide-react";
import { useTheme } from "../theme";
import type { SaveStatus } from "../state";

interface Props {
  title: string;
  subtitle?: string;
  saveStatus: SaveStatus;
  saveError: string | null;
  onClickAdd: () => void;
  addMenuOpen: boolean;
}

function SaveIndicator({
  status,
  error,
}: {
  status: SaveStatus;
  error: string | null;
}) {
  if (status === "idle") return null;
  if (status === "dirty") {
    return <span className="save-indicator dirty">unsaved</span>;
  }
  if (status === "saving") {
    return (
      <span className="save-indicator saving">
        <Loader2 size={12} className="spin" /> saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="save-indicator saved">
        <Check size={12} /> saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="save-indicator error" title={error ?? "unknown"}>
        <AlertCircle size={12} /> save failed
      </span>
    );
  }
  return null;
}

export function TopBar({
  title,
  subtitle,
  saveStatus,
  saveError,
  onClickAdd,
  addMenuOpen,
}: Props) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="topbar">
      <div className="title">{title}</div>
      {subtitle && <div className="subtitle">{subtitle}</div>}
      <SaveIndicator status={saveStatus} error={saveError} />
      <button
        onClick={onClickAdd}
        title="Add node"
        aria-label="Add node"
        aria-expanded={addMenuOpen}
      >
        <Plus size={16} /> Add
      </button>
      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        aria-label="Toggle theme"
      >
        {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </div>
  );
}
