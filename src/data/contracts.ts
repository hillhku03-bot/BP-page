export type ConfidenceFlag =
  | "ok"
  | "low_sample"
  | "confirmed"
  | "derived"
  | "mixed"
  | "raw"
  | "bp_behavior"
  | string;

export interface EventSummary {
  event_group: string;
  match_count: number;
  first_match: string;
  last_match: string;
}

export interface Hero {
  hero_id: number;
  hero_name_en1?: string;
  hero_name_en2?: string;
  hero_name?: string;
  hero_name_cn?: string;
  hero_name_cn2?: string;
}

export interface HeroEventMetric {
  patch_version: string;
  event_group: string;
  hero_id: number;
  match_count: number;
  pick_count: number;
  ban_count: number;
  first_ban?: number;
  first_pick?: number;
  player_pick_count?: number;
  wins?: number;
  heat_rate: number;
  pick_rate: number;
  ban_rate: number;
  win_rate?: number | null;
  first_phase_contest_rate: number;
  confidence_flag?: ConfidenceFlag;
  calculation_version?: string;
}

export interface HeroPositionMetric {
  patch_version: string;
  event_group: string;
  hero_id: number;
  position: number;
  position_pick_count: number;
  match_count: number;
  position_pick_rate: number;
  confidence_flag: ConfidenceFlag;
  confirmed_count?: number;
  derived_count?: number;
}

export interface HeroPairRelation {
  patch_version: string;
  event_group: string;
  hero_a_id: number;
  hero_b_id: number;
  relation_type: "counter" | "synergy" | string;
  evidence_type: string;
  sample_size: number;
  wins?: number;
  losses?: number;
  rate?: number;
  delta_vs_baseline?: number;
  confidence_flag: ConfidenceFlag;
}

export interface HeroLaningRelation {
  patch_version: string;
  event_group: string;
  hero_a_id: number;
  hero_b_id: number;
  relation_type: "counter" | "synergy" | string;
  evidence_type: string;
  lane_context: "side" | "mid" | string;
  sample_size: number;
  lane_advantage_wins: number;
  lane_advantage_losses: number;
  lane_advantage_rate: number;
  avg_hit_diff_5m: number;
  confidence_flag: ConfidenceFlag;
}

export interface DataQualityEvent {
  event_group: string;
  match_count: number;
  bp_complete_matches: number;
  player_complete_matches: number;
  confirmed_position_complete_matches: number;
  raw_position_complete_matches: number;
  issue_count: number;
  bp_complete_rate: number;
  player_complete_rate: number;
  confirmed_position_complete_rate: number;
  raw_position_complete_rate: number;
}

export interface DataQuality {
  patch_version: string;
  calculation_version: string;
  totals: {
    matches: number;
    bp_matches: number;
    player_matches: number;
    confirmed_position_matches: number;
    raw_position_matches: number;
    issue_count: number;
  };
  event_match_counts: Record<string, number>;
  event_quality: DataQualityEvent[];
  issue_summary: Record<string, number>;
  issues: Array<Record<string, unknown>>;
}

export interface AppData {
  events: EventSummary[];
  heroes: Hero[];
  heroEventMetrics: HeroEventMetric[];
  heroPositionMetrics: HeroPositionMetric[];
  heroPairRelations: HeroPairRelation[];
  heroLaningRelations: HeroLaningRelation[];
  dataQuality: DataQuality;
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === "string";

export function isHeroEventMetric(value: unknown): value is HeroEventMetric {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isString(candidate.patch_version) &&
    isString(candidate.event_group) &&
    isNumber(candidate.hero_id) &&
    isNumber(candidate.match_count) &&
    isNumber(candidate.pick_count) &&
    isNumber(candidate.ban_count) &&
    isNumber(candidate.heat_rate) &&
    isNumber(candidate.pick_rate) &&
    isNumber(candidate.ban_rate) &&
    isNumber(candidate.first_phase_contest_rate)
  );
}
