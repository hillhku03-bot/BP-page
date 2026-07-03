import type { AppData } from "./contracts";

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadAppData(): Promise<AppData> {
  const [
    events,
    heroes,
    heroEventMetrics,
    heroPositionMetrics,
    heroPairRelations,
    heroLaningRelations,
    dataQuality
  ] = await Promise.all([
    loadJson<AppData["events"]>("/data/events.json"),
    loadJson<AppData["heroes"]>("/data/heroes.json"),
    loadJson<AppData["heroEventMetrics"]>("/data/hero_event_metrics.json"),
    loadJson<AppData["heroPositionMetrics"]>("/data/hero_position_metrics.json"),
    loadJson<AppData["heroPairRelations"]>("/data/hero_pair_relations.json"),
    loadJson<AppData["heroLaningRelations"]>("/data/hero_laning_relations.json"),
    loadJson<AppData["dataQuality"]>("/data/data_quality.json")
  ]);

  return {
    events,
    heroes,
    heroEventMetrics,
    heroPositionMetrics,
    heroPairRelations,
    heroLaningRelations,
    dataQuality
  };
}
