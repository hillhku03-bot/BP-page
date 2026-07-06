export type PositionFilter = "all" | "1" | "2" | "3" | "4" | "5";
export type ConfidenceFilter = "all" | "confirmed" | "derived" | "mixed";
export type TabKey = "heroes" | "movement" | "relations" | "bp_laning";

export interface AppFilters {
  eventGroups: string[];
  position: PositionFilter;
  confidence: ConfidenceFilter;
  minSample: number;
  heroSearch: string;
}

export const defaultFilters: AppFilters = {
  eventGroups: [],
  position: "all",
  confidence: "all",
  minSample: 5,
  heroSearch: ""
};

const isPosition = (value: string | null): value is PositionFilter =>
  value === "all" || value === "1" || value === "2" || value === "3" || value === "4" || value === "5";

const isConfidence = (value: string | null): value is ConfidenceFilter =>
  value === "all" || value === "confirmed" || value === "derived" || value === "mixed";

export function serializeFilters(filters: AppFilters): string {
  const params = new URLSearchParams();
  params.set("eventGroups", filters.eventGroups.join(","));
  params.set("position", filters.position);
  params.set("confidence", filters.confidence);
  params.set("minSample", String(filters.minSample));
  params.set("heroSearch", filters.heroSearch);
  return params.toString();
}

export function parseFilters(query: string): AppFilters {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const position = params.get("position");
  const confidence = params.get("confidence");
  const minSample = Number(params.get("minSample"));
  const eventGroups =
    params
      .get("eventGroups")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ??
    (params.get("eventGroup") && params.get("eventGroup") !== "all" ? [params.get("eventGroup") as string] : []);
  return {
    eventGroups,
    position: isPosition(position) ? position : defaultFilters.position,
    confidence: isConfidence(confidence) ? confidence : defaultFilters.confidence,
    minSample: Number.isFinite(minSample) && minSample >= 0 ? minSample : defaultFilters.minSample,
    heroSearch: params.get("heroSearch") || defaultFilters.heroSearch
  };
}
