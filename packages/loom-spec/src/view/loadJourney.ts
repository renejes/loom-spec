import type { LoomJourney } from "../types/journey";
import { getExportData } from "./exportMode";

export interface JourneySummary {
  id: string;
  title: string;
  description?: string;
  diagram: string;
  stepCount: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = ` — ${(body as { error?: string }).error ?? ""}`;
    } catch {
      // ignore
    }
    throw new Error(`${url}: ${res.status} ${res.statusText}${detail}`);
  }
  return (await res.json()) as T;
}

function summarizeJourney(id: string, j: LoomJourney): JourneySummary {
  return {
    id,
    title: j.title,
    description: j.description,
    diagram: j.diagram,
    stepCount: j.steps?.length ?? 0,
  };
}

export async function listJourneys(): Promise<JourneySummary[]> {
  const d = getExportData();
  if (d) {
    const journeys = d.journeys ?? {};
    return Object.entries(journeys)
      .map(([id, j]) => summarizeJourney(id, j))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  return fetchJson<JourneySummary[]>("/api/journeys");
}

export async function loadJourney(id: string): Promise<LoomJourney> {
  const d = getExportData();
  if (d) {
    const journey = d.journeys?.[id];
    if (!journey) throw new Error(`Journey '${id}' not in this export.`);
    return journey;
  }
  return fetchJson<LoomJourney>(`/api/journeys/${id}`);
}
