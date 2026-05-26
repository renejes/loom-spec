import { Moon, Sun, Plus, Check, Loader2, AlertCircle, ChevronLeft, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useTheme } from "../theme";
import type { SaveStatus, ConnectionStatus } from "../state";
import { DiagramSwitcher } from "./DiagramSwitcher";
import type { DiagramSummary } from "../loadDiagram";
import type { JourneySummary } from "../loadJourney";
import type { ViewState, ViewKind } from "../useViewState";

interface Props {
  viewKind?: ViewKind;
  viewId: string;
  title: string;
  subtitle?: string;
  diagrams: DiagramSummary[];
  journeys?: JourneySummary[];
  saveStatus: SaveStatus;
  saveError: string | null;
  connectionStatus: ConnectionStatus;
  validationErrorCount?: number;
  onClickAdd?: () => void;
  addMenuOpen?: boolean;
  isDefault: boolean;
  onClickHome: () => void;
  onNavigate: (view: ViewState) => void;
  onCreateDiagram?: () => void;
  addButtonRef?: React.RefObject<HTMLButtonElement> | null;
  hideAddButton?: boolean;
}

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return (
      <span
        className="conn-dot connected"
        title="Live sync connected"
        aria-label="Live sync connected"
      >
        <Wifi size={12} />
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span
        className="conn-dot connecting"
        title="Connecting to live sync…"
        aria-label="Connecting"
      >
        <Loader2 size={12} className="spin" />
      </span>
    );
  }
  return (
    <span
      className="conn-dot disconnected"
      title="Live sync disconnected — reconnecting in the background"
      aria-label="Disconnected"
    >
      <WifiOff size={12} />
    </span>
  );
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
  viewKind = "diagram",
  viewId,
  title,
  subtitle,
  diagrams,
  journeys,
  saveStatus,
  saveError,
  connectionStatus,
  validationErrorCount = 0,
  onClickAdd,
  addMenuOpen = false,
  isDefault,
  onClickHome,
  onNavigate,
  onCreateDiagram,
  addButtonRef,
  hideAddButton = false,
}: Props) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="topbar">
      {!isDefault && (
        <button
          className="breadcrumb-back"
          onClick={onClickHome}
          title="Back to overview"
          aria-label="Back to overview"
        >
          <ChevronLeft size={14} /> Overview
        </button>
      )}
      <DiagramSwitcher
        currentKind={viewKind}
        currentId={viewId}
        currentTitle={title}
        diagrams={diagrams}
        journeys={journeys}
        onNavigate={onNavigate}
        onCreate={onCreateDiagram}
      />
      {subtitle && <div className="subtitle">{subtitle}</div>}
      {validationErrorCount > 0 && (
        <span
          className="validation-chip"
          title={`${validationErrorCount} validation issue${validationErrorCount === 1 ? "" : "s"} — check the inspector`}
        >
          <AlertTriangle size={12} /> {validationErrorCount}
        </span>
      )}
      <ConnectionDot status={connectionStatus} />
      <SaveIndicator status={saveStatus} error={saveError} />
      {!hideAddButton && addButtonRef && onClickAdd && (
        <button
          ref={addButtonRef}
          onClick={onClickAdd}
          title="Add node"
          aria-label="Add node"
          aria-expanded={addMenuOpen}
        >
          <Plus size={16} /> Add
        </button>
      )}
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
