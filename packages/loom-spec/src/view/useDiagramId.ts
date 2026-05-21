import { useCallback, useEffect, useState } from "react";

const DEFAULT_ID = "overview";

function readHashId(): string {
  if (typeof location === "undefined") return DEFAULT_ID;
  const raw = location.hash.replace(/^#/, "").trim();
  return raw || DEFAULT_ID;
}

/**
 * Diagram id wired to `location.hash`. Updates on `hashchange` (including
 * browser back/forward), and exposes a setter that writes the hash.
 * The default diagram (`overview`) is represented as an empty hash so the
 * baseline URL stays clean.
 */
export function useDiagramId(): {
  id: string;
  navigate: (id: string) => void;
  isDefault: boolean;
} {
  const [id, setId] = useState<string>(() => readHashId());

  useEffect(() => {
    const handler = () => setId(readHashId());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = useCallback((newId: string) => {
    const next = newId === DEFAULT_ID ? "" : `#${newId}`;
    // Use history.pushState so the back button works as a "drill up" too.
    history.pushState(null, "", next || location.pathname);
    setId(newId);
  }, []);

  return { id, navigate, isDefault: id === DEFAULT_ID };
}
