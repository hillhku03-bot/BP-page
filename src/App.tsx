import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Database,
  GitCompare,
  ListFilter,
  Search,
  ShieldCheck,
  Swords,
  TrendingUp
} from "lucide-react";
import { loadAppData } from "./data/loadData";
import type {
  AppData,
  Hero,
  HeroEventMetric,
  HeroPairRelation,
  HeroPositionMetric
} from "./data/contracts";
import { defaultFilters, parseFilters, serializeFilters, type AppFilters, type TabKey } from "./data/filters";

const numberFormat = new Intl.NumberFormat("zh-CN");

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "heroes", label: "英雄热度" },
  { key: "movement", label: "热度变化" },
  { key: "relations", label: "克制配合" },
  { key: "bp_laning", label: "首轮 BP" }
];

const evidenceLabels: Record<string, string> = {
  vs_winrate_counter: "对位胜率",
  same_side_winrate_synergy: "同阵胜率",
  same_side_pick_after_a_synergy: "先选后己方选",
  ally_pick_after_a_synergy: "先选后己方选",
  enemy_pick_after_a_counter: "先选后对方选",
  own_ban_after_a_counter: "先选后己方 Ban",
  enemy_ban_after_a_synergy: "先选后对方 Ban",
  side_hits_counter: "边路补刀差",
  side_same_lane_hits_synergy: "同路补刀差",
  mid_hits_counter: "中路补刀差"
};

const sameSidePickAfterASynergyEvidenceTypes = new Set([
  "same_side_pick_after_a_synergy",
  "ally_pick_after_a_synergy"
]);

const WINRATE_MIN_SAMPLE = 12;
const WINRATE_MIN_EDGE = 0.15;
const BP_MIN_SAMPLE = 5;
const BP_MIN_LIFT = 0.15;
const MOVEMENT_MIN_ABS_DELTA = 0.1;
const GLOBAL_RELATION_LIMIT = 30;

const relationGroupLabels: Record<HeroRelationGroupKey, string> = {
  countered_by: "被克制",
  counters: "克制",
  synergies: "配合",
  anti_synergies: "不配合"
};

const heroDetailTabs: Array<{ key: HeroDetailTabKey; label: string }> = [
  { key: "countered_by", label: "被克制" },
  { key: "counters", label: "克制" },
  { key: "synergies", label: "配合" },
  { key: "anti_synergies", label: "不配合" }
];

type HeroRelationGroupKey = "countered_by" | "counters" | "synergies" | "anti_synergies";
type HeroDetailTabKey = HeroRelationGroupKey;

interface HeroRelationDetailItem {
  otherHeroId: number;
  groupKey: HeroRelationGroupKey;
  totalSample: number;
  strongestRate: number;
  hasWinningEvidence: boolean;
  detailTexts: string[];
}

interface HeroRelationDetailSection {
  key: string;
  title: string;
  items: HeroRelationDetailItem[];
}

type HeroRelationDetailGroups = Record<HeroRelationGroupKey, HeroRelationDetailSection[]>;

const heroRelationSectionDefinitions: Record<HeroRelationGroupKey, Array<{ key: string; title: string }>> = {
  countered_by: [
    { key: "ban_after_a", title: "选A后己方 Ban B" },
    { key: "enemy_pick_after_a", title: "选A后对方选 B" },
    { key: "low_vs_winrate", title: "己方A对方B胜率低" }
  ],
  counters: [
    { key: "ally_pick_after_enemy_b", title: "对方B后己方选 A" },
    { key: "ban_a_after_enemy_b", title: "对方选B后 Ban A" },
    { key: "high_vs_winrate", title: "己方A对方B胜率高" }
  ],
  synergies: [
    { key: "same_side_winrate", title: "己方选AB胜率高" },
    { key: "enemy_ban_after_a", title: "己方选A后对方 Ban B" },
    { key: "ally_ban_after_enemy_a", title: "对方选A后己方 Ban B" }
  ],
  anti_synergies: [
    { key: "same_side_lossrate", title: "选出A和B后胜率低" }
  ]
};

interface HeroMovementRow extends HeroEventMetric {
  delta: number;
  baseline_event: string;
}

interface HeroBpTrendRow extends HeroEventMetric {
  delta: number;
  baseline_event: string;
}

interface HeroRecentHeatRow extends HeroEventMetric {
  delta: number | null;
  previousEvent: string;
  eventDate: string;
}

interface MatchupTarget {
  otherHeroId: number;
  totalSample: number;
  strongestScore: number;
  detailTexts: string[];
  detailMap: Map<string, string>;
}

interface MatchupHeroRow {
  heroId: number;
  counteredBy: MatchupTarget[];
  synergies: MatchupTarget[];
  totalSample: number;
  strongestScore: number;
}

type GlobalRelationType = "counter" | "synergy";

interface GlobalRelationPair {
  heroAId: number;
  heroBId: number;
  relationType: GlobalRelationType;
  totalSample: number;
  strongestScore: number;
  detailTexts: string[];
  detailMap: Map<string, string>;
}

function pct(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
}

function signedPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}pp`;
}

function heroName(hero?: Hero) {
  if (!hero) {
    return "Unknown";
  }
  const cn = hero.hero_name_cn || hero.hero_name_cn2 || hero.hero_name;
  const en = hero.hero_name_en2 || hero.hero_name_en1;
  if (cn && en && cn !== en) {
    return `${cn} / ${en}`;
  }
  return cn || en || `Hero ${hero.hero_id}`;
}

function heroPrimaryName(hero?: Hero) {
  if (!hero) {
    return "Unknown";
  }
  return heroName(hero).split(" / ")[0] || `Hero ${hero.hero_id}`;
}

function heroImageUrl(hero?: Hero) {
  const prefix = "npc_dota_hero_";
  if (!hero?.hero_name?.startsWith(prefix)) {
    return "";
  }
  const slug = hero.hero_name.slice(prefix.length);
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

function orderedEvents(data: AppData) {
  return [...data.events].sort((a, b) => a.first_match.localeCompare(b.first_match));
}

function defaultEventGroups(data: AppData) {
  return orderedEvents(data)
    .slice(-2)
    .map((event) => event.event_group);
}

function selectedEvents(data: AppData, filters: AppFilters) {
  const events = orderedEvents(data);
  const selected = new Set(filters.eventGroups);
  const rows = filters.eventGroups.length > 0 ? events.filter((event) => selected.has(event.event_group)) : [];
  if (rows.length >= 2) {
    return rows;
  }
  if (rows.length === 1) {
    const index = events.findIndex((event) => event.event_group === rows[0].event_group);
    const paired = index > 0 ? [events[index - 1], rows[0]] : events.slice(0, 2);
    return paired.filter(Boolean);
  }
  return events.slice(-2);
}

function selectedEventGroups(data: AppData, filters: AppFilters) {
  return selectedEvents(data, filters).map((event) => event.event_group);
}

function sameEventGroups(left: string[], right: string[]) {
  return left.length === right.length && left.every((eventGroup, index) => eventGroup === right[index]);
}

function latestEventDate(data: AppData) {
  return orderedEvents(data).reduce((latest, event) => {
    const candidate = new Date(event.last_match || event.first_match);
    return Number.isFinite(candidate.getTime()) && candidate > latest ? candidate : latest;
  }, new Date(0));
}

function threeMonthsBefore(date: Date) {
  const result = new Date(date);
  result.setMonth(result.getMonth() - 3);
  return result;
}

function relationLabel(type: string) {
  return type === "synergy" ? "配合" : "克制";
}

function confidenceLabel(flag: string | undefined) {
  if (flag === "confirmed") return "确认";
  if (flag === "derived") return "推断";
  if (flag === "mixed") return "混合";
  if (flag === "low_sample") return "低样本";
  if (flag === "ok") return "样本可用";
  return flag || "-";
}

function eventMatches(filters: AppFilters, eventGroup: string) {
  return filters.eventGroups.length === 0 || filters.eventGroups.includes(eventGroup);
}

function useHeroTools(data: AppData | null) {
  return useMemo(() => {
    const heroById = new Map<number, Hero>();
    data?.heroes.forEach((hero) => heroById.set(hero.hero_id, hero));

    const positionByHeroEvent = new Map<string, HeroPositionMetric[]>();
    data?.heroPositionMetrics.forEach((row) => {
      const key = `${row.event_group}|${row.hero_id}`;
      const rows = positionByHeroEvent.get(key) ?? [];
      rows.push(row);
      positionByHeroEvent.set(key, rows);
    });
    positionByHeroEvent.forEach((rows) =>
      rows.sort((a, b) => b.position_pick_count - a.position_pick_count || a.position - b.position)
    );

    const label = (heroId: number) => heroName(heroById.get(heroId));
    const primaryName = (heroId: number) => heroPrimaryName(heroById.get(heroId));
    const imageUrl = (heroId: number) => heroImageUrl(heroById.get(heroId));
    const searchHit = (heroId: number, query: string) => {
      const text = `${label(heroId)} ${heroId}`.toLowerCase();
      return text.includes(query.trim().toLowerCase());
    };
    const positionSummary = (eventGroup: string, heroId: number) => {
      const rows = (positionByHeroEvent.get(`${eventGroup}|${heroId}`) ?? []).filter(
        (row) => row.confidence_flag === "confirmed"
      );
      if (rows.length === 0) {
        return "位置未确认";
      }
      return rows
        .slice(0, 2)
        .map((row) => `${row.position}号位 ${confidenceLabel(row.confidence_flag)}`)
        .join(" / ");
    };

    return { label, primaryName, imageUrl, searchHit, positionSummary, positionByHeroEvent };
  }, [data]);
}

function metricPassesFilters(
  metric: HeroEventMetric,
  filters: AppFilters,
  tools: ReturnType<typeof useHeroTools>
) {
  if (!eventMatches(filters, metric.event_group)) {
    return false;
  }
  if (filters.heroSearch && !tools.searchHit(metric.hero_id, filters.heroSearch)) {
    return false;
  }
  if (filters.position === "all" && filters.confidence === "all") {
    return true;
  }
  const positions = tools.positionByHeroEvent.get(`${metric.event_group}|${metric.hero_id}`) ?? [];
  if (filters.position !== "all") {
    return positions.some((row) => row.confidence_flag === "confirmed" && String(row.position) === filters.position);
  }
  return positions.some((row) => {
    const confidenceOk = filters.confidence === "all" || row.confidence_flag === filters.confidence;
    return confidenceOk;
  });
}

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("movement");
  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null);
  const [filters, setFilters] = useState<AppFilters>(() =>
    typeof window === "undefined" ? defaultFilters : parseFilters(window.location.search)
  );
  const tools = useHeroTools(data);

  useEffect(() => {
    let mounted = true;
    loadAppData()
      .then((loaded) => {
        if (mounted) {
          setData(loaded);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const query = serializeFilters(filters);
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [filters]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const normalized = selectedEventGroups(data, filters);
    if (sameEventGroups(normalized, filters.eventGroups)) {
      return;
    }
    setFilters((current) => {
      const nextEventGroups = selectedEventGroups(data, current);
      return sameEventGroups(nextEventGroups, current.eventGroups)
        ? current
        : { ...current, eventGroups: nextEventGroups };
    });
  }, [data, filters]);

  if (error) {
    return (
      <main className="app-shell">
        <section className="workspace">
          <div className="load-state">数据加载失败：{error}</div>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="app-shell">
        <section className="workspace">
          <div className="load-state">加载 7.41 样本数据...</div>
        </section>
      </main>
    );
  }

  const effectiveFilters = { ...filters, eventGroups: selectedEventGroups(data, filters) };

  const totalMatches = data.dataQuality.totals.matches;
  const bpRate = data.dataQuality.totals.bp_matches / Math.max(totalMatches, 1);
  const confirmedPositionRate = data.dataQuality.totals.confirmed_position_matches / Math.max(totalMatches, 1);

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Dota 2 Patch 7.41</p>
            <h1>英雄环境监测</h1>
          </div>
          <div className="status-pill" aria-label="data status">
            Local DB 主口径
          </div>
        </header>

        <section className="summary-grid" aria-label="overview">
          <SummaryCard icon={Database} label="比赛样本" value={`${numberFormat.format(totalMatches)} 场`} />
          <SummaryCard icon={Activity} label="赛事单元" value={`${data.events.length}`} />
          <SummaryCard icon={TrendingUp} label="BP 覆盖" value={pct(bpRate)} />
          <SummaryCard icon={ShieldCheck} label="质量异常" value={`${data.dataQuality.totals.issue_count}`} />
        </section>

        <FilterBar data={data} filters={effectiveFilters} onChange={setFilters} />
        <QualityPanel
          data={data}
          confirmedPositionRate={confirmedPositionRate}
          selectedEventGroups={effectiveFilters.eventGroups}
        />

        <nav className="tab-strip" aria-label="dashboard tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "heroes" && (
          <HeroRankingPanel
            data={data}
            tools={tools}
            filters={effectiveFilters}
            selectedHeroId={selectedHeroId}
            onSelectHero={setSelectedHeroId}
          />
        )}
        {activeTab === "movement" && (
          <MovementPanel
            data={data}
            filters={effectiveFilters}
            tools={tools}
            selectedHeroId={selectedHeroId}
            onSelectHero={setSelectedHeroId}
          />
        )}
        {activeTab === "relations" && <RelationsPanel data={data} filters={effectiveFilters} tools={tools} />}
        {activeTab === "bp_laning" && <BpLaningPanel data={data} filters={effectiveFilters} tools={tools} />}
      </section>
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <article className="summary-card">
      <Icon aria-hidden="true" size={20} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function FilterBar({
  data,
  filters,
  onChange
}: {
  data: AppData;
  filters: AppFilters;
  onChange: (filters: AppFilters) => void;
}) {
  const [draftFilters, setDraftFilters] = useState(filters);

  const update = (patch: Partial<AppFilters>) => setDraftFilters((current) => ({ ...current, ...patch }));
  const eventOrder = orderedEvents(data);
  const selectedSet = new Set(draftFilters.eventGroups);
  const toggleEvent = (eventGroup: string) => {
    const isSelected = selectedSet.has(eventGroup);
    if (isSelected && draftFilters.eventGroups.length <= 2) {
      return;
    }
    const nextSelection = isSelected
      ? draftFilters.eventGroups.filter((selected) => selected !== eventGroup)
      : [...draftFilters.eventGroups, eventGroup];
    update({
      eventGroups: eventOrder
        .filter((event) => nextSelection.includes(event.event_group))
        .map((event) => event.event_group)
    });
  };

  return (
    <section className="filter-bar" aria-label="filters">
      <div className="event-multi">
        <span>赛事对比</span>
        <div className="event-checkbox-grid">
          {eventOrder.map((event) => (
            <label className="event-check" key={event.event_group}>
              <input
                checked={selectedSet.has(event.event_group)}
                onChange={() => toggleEvent(event.event_group)}
                type="checkbox"
              />
              <span>{event.event_group}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="segmented" aria-label="position filter">
        {["all", "1", "2", "3", "4", "5"].map((position) => (
          <button
            key={position}
            className={draftFilters.position === position ? "active" : ""}
            onClick={() => update({ position: position as AppFilters["position"] })}
            type="button"
          >
            {position === "all" ? "全位置" : position}
          </button>
        ))}
      </div>

      <label>
        <span>位置置信</span>
        <select
          value={draftFilters.confidence}
          onChange={(event) => update({ confidence: event.target.value as AppFilters["confidence"] })}
        >
          <option value="all">全部</option>
          <option value="confirmed">确认</option>
          <option value="derived">推断</option>
          <option value="mixed">混合</option>
        </select>
      </label>

      <label>
        <span>最小样本</span>
        <input
          min={1}
          max={30}
          type="number"
          value={draftFilters.minSample}
          onChange={(event) => update({ minSample: Number(event.target.value) || 1 })}
        />
      </label>

      <label className="search-box">
        <Search aria-hidden="true" size={16} />
        <input
          value={draftFilters.heroSearch}
          onChange={(event) => update({ heroSearch: event.target.value })}
          placeholder="英雄"
        />
      </label>

      <button className="apply-filter-button" onClick={() => onChange(draftFilters)} type="button">
        确认
      </button>
    </section>
  );
}

function QualityPanel({
  data,
  confirmedPositionRate,
  selectedEventGroups
}: {
  data: AppData;
  confirmedPositionRate: number;
  selectedEventGroups: string[];
}) {
  const issueTypes = Object.entries(data.dataQuality.issue_summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" / ");
  const selectedEventSet = new Set(selectedEventGroups);
  const incompletePositionEvents = data.dataQuality.event_quality.filter(
    (event) => selectedEventSet.has(event.event_group) && event.confirmed_position_complete_rate < 1
  );
  return (
    <section className="quality-strip" aria-label="data quality">
      <div>
        <strong>{pct(confirmedPositionRate)}</strong>
        <span>确认位置覆盖</span>
      </div>
      <div>
        <strong>{numberFormat.format(data.dataQuality.totals.confirmed_position_matches)}</strong>
        <span>确认位置场次</span>
      </div>
      <div>
        <strong>{data.dataQuality.totals.issue_count}</strong>
        <span>{issueTypes || "无结构化异常"}</span>
      </div>
      {incompletePositionEvents.length > 0 && (
        <p className="quality-warning">
          报名位置未完整覆盖：
          {incompletePositionEvents
            .map(
              (event) =>
                `${event.event_group} ${event.confirmed_position_complete_matches}/${event.player_complete_matches} 场`
            )
            .join("；")}
        </p>
      )}
    </section>
  );
}

function HeroRankingPanel({
  data,
  tools,
  filters,
  selectedHeroId,
  onSelectHero
}: {
  data: AppData;
  tools: ReturnType<typeof useHeroTools>;
  filters: AppFilters;
  selectedHeroId: number | null;
  onSelectHero: (heroId: number | null) => void;
}) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const eventColumns = selectedEvents(data, filters).map((event) => {
    const rows = data.heroEventMetrics
      .filter((metric) => metric.event_group === event.event_group)
      .filter((metric) => metricPassesFilters(metric, { ...filters, eventGroups: [event.event_group] }, tools))
      .sort(
        (a, b) =>
          b.heat_rate - a.heat_rate ||
          b.pick_count + b.ban_count - (a.pick_count + a.ban_count) ||
          a.hero_id - b.hero_id
      );
    return { event, rows };
  });

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <ListFilter aria-hidden="true" size={18} />
          <h2>英雄热度排行榜</h2>
        </div>
        <span>每个所选赛事独立排名</span>
      </div>
      <div className="event-ranking-grid">
        {eventColumns.map(({ event, rows }) => (
          <section className="event-ranking-column" key={event.event_group}>
            <div className="event-ranking-header">
              <h3>{event.event_group}</h3>
              <span>{numberFormat.format(event.match_count)} 场</span>
            </div>
            {rows.length === 0 ? (
              <p className="empty-note">当前筛选下暂无英雄样本。</p>
            ) : (
              <div className="event-ranking-list">
                {rows.map((row, index) => {
                  const rowKey = `${row.event_group}-${row.hero_id}`;
                  const rowSelected = selectedHeroId === row.hero_id && selectedRowKey === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <div className="event-hero-row">
                        <span className="event-hero-rank">{index + 1}</span>
                        <div className="event-hero-main">
                          <HeroAvatarButton
                            heroId={row.hero_id}
                            tools={tools}
                            selected={rowSelected}
                            onClick={() => {
                              setSelectedRowKey(rowSelected ? null : rowKey);
                              onSelectHero(rowSelected ? null : row.hero_id);
                            }}
                          />
                          <span>
                            Pick {row.pick_count} / Ban {row.ban_count} / 首轮 {pct(row.first_phase_contest_rate)}
                          </span>
                        </div>
                        <div className="event-hero-heat">
                          <strong>{pct(row.heat_rate)}</strong>
                          <span>{tools.positionSummary(row.event_group, row.hero_id) || "全位置"}</span>
                        </div>
                      </div>
                      {rowSelected && (
                        <div className="event-hero-detail-row">
                          <HeroRelationDetailPanel
                            heroId={row.hero_id}
                            data={data}
                            filters={filters}
                            tools={tools}
                            onClose={() => {
                              setSelectedRowKey(null);
                              onSelectHero(null);
                            }}
                          />
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
      <footer className="panel-foot">{numberFormat.format(data.heroEventMetrics.length)} 条英雄-赛事指标</footer>
    </section>
  );
}

function HeroAvatar({ heroId, tools, large = false }: { heroId: number; tools: ReturnType<typeof useHeroTools>; large?: boolean }) {
  const name = tools.primaryName(heroId);
  const imageUrl = tools.imageUrl(heroId);
  return (
    <span className={large ? "hero-avatar large" : "hero-avatar"}>
      {imageUrl && (
        <img
          alt={`${name}官方头像`}
          src={imageUrl}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <span className="hero-avatar-fallback" aria-hidden="true">
        {name.slice(0, 1)}
      </span>
    </span>
  );
}

function HeroAvatarButton({
  heroId,
  tools,
  selected,
  onClick
}: {
  heroId: number;
  tools: ReturnType<typeof useHeroTools>;
  selected: boolean;
  onClick: () => void;
}) {
  const name = tools.primaryName(heroId);
  return (
    <button
      aria-label={`查看${name}关系详情`}
      className={selected ? "hero-avatar-button active" : "hero-avatar-button"}
      onClick={onClick}
      type="button"
    >
      <HeroAvatar heroId={heroId} tools={tools} />
      <span>{tools.label(heroId)}</span>
    </button>
  );
}

type HeroActionKind = "pick" | "ban";

interface AggregatedWinrateRelation {
  heroAId: number;
  heroBId: number;
  evidenceType: string;
  sample: number;
  wins: number;
  losses: number;
}

interface AggregatedBpRelation {
  heroAId: number;
  heroBId: number;
  evidenceType: string;
  sample: number;
}

interface StrongBpEvidence {
  evidenceKey: string;
  sample: number;
  conditionalRate: number;
  lift: number;
  score: number;
  text: string;
}

const winrateEvidenceTypes = new Set(["vs_winrate_counter", "same_side_winrate_synergy"]);

function normalizedBpEvidenceType(evidenceType: string) {
  return sameSidePickAfterASynergyEvidenceTypes.has(evidenceType) ? "same_side_pick_after_a_synergy" : evidenceType;
}

function bpEvidenceAction(evidenceType: string): HeroActionKind | null {
  const normalized = normalizedBpEvidenceType(evidenceType);
  if (normalized === "enemy_pick_after_a_counter" || normalized === "same_side_pick_after_a_synergy") {
    return "pick";
  }
  if (normalized === "own_ban_after_a_counter" || normalized === "enemy_ban_after_a_synergy") {
    return "ban";
  }
  return null;
}

function isCounterBpEvidence(evidenceType: string) {
  const normalized = normalizedBpEvidenceType(evidenceType);
  return normalized === "enemy_pick_after_a_counter" || normalized === "own_ban_after_a_counter";
}

function isSynergyBpEvidence(evidenceType: string) {
  const normalized = normalizedBpEvidenceType(evidenceType);
  return normalized === "same_side_pick_after_a_synergy" || normalized === "enemy_ban_after_a_synergy";
}

function buildHeroEventMetricLookup(data: AppData) {
  const lookup = new Map<string, HeroEventMetric>();
  data.heroEventMetrics.forEach((metric) => {
    lookup.set(`${metric.event_group}|${metric.hero_id}`, metric);
  });
  return lookup;
}

function selectedEventMatchCount(data: AppData, eventGroups: string[]) {
  const selected = new Set(eventGroups);
  return data.events.reduce((sum, event) => sum + (selected.has(event.event_group) ? event.match_count : 0), 0);
}

function heroActionCount(
  lookup: Map<string, HeroEventMetric>,
  eventGroups: string[],
  heroId: number,
  action: HeroActionKind
) {
  return eventGroups.reduce((sum, eventGroup) => {
    const metric = lookup.get(`${eventGroup}|${heroId}`);
    if (!metric) {
      return sum;
    }
    return sum + (action === "pick" ? metric.pick_count : metric.ban_count);
  }, 0);
}

function relationWins(row: HeroPairRelation) {
  if (typeof row.wins === "number") {
    return row.wins;
  }
  return Math.round((row.rate ?? 0) * row.sample_size);
}

function relationLosses(row: HeroPairRelation, wins: number) {
  if (typeof row.losses === "number") {
    return row.losses;
  }
  return Math.max(0, row.sample_size - wins);
}

function aggregateWinrateRelations(rows: HeroPairRelation[]) {
  const grouped = new Map<string, AggregatedWinrateRelation>();
  rows.forEach((row) => {
    if (row.confidence_flag !== "ok" || !winrateEvidenceTypes.has(row.evidence_type)) {
      return;
    }
    const key = `${row.hero_a_id}:${row.hero_b_id}:${row.evidence_type}`;
    const wins = relationWins(row);
    const current =
      grouped.get(key) ??
      ({
        heroAId: row.hero_a_id,
        heroBId: row.hero_b_id,
        evidenceType: row.evidence_type,
        sample: 0,
        wins: 0,
        losses: 0
      } satisfies AggregatedWinrateRelation);
    current.sample += row.sample_size;
    current.wins += wins;
    current.losses += relationLosses(row, wins);
    grouped.set(key, current);
  });
  return Array.from(grouped.values());
}

function aggregateBpRelations(rows: HeroPairRelation[]) {
  const grouped = new Map<string, AggregatedBpRelation>();
  rows.forEach((row) => {
    const evidenceType = normalizedBpEvidenceType(row.evidence_type);
    if (row.confidence_flag !== "ok" || !bpEvidenceAction(evidenceType)) {
      return;
    }
    const key = `${row.hero_a_id}:${row.hero_b_id}:${evidenceType}`;
    const current =
      grouped.get(key) ??
      ({
        heroAId: row.hero_a_id,
        heroBId: row.hero_b_id,
        evidenceType,
        sample: 0
      } satisfies AggregatedBpRelation);
    current.sample += row.sample_size;
    grouped.set(key, current);
  });
  return Array.from(grouped.values());
}

function winrateRelationRate(relation: AggregatedWinrateRelation) {
  return relation.sample > 0 ? relation.wins / relation.sample : 0;
}

function winLossText(wins: number, losses: number) {
  return `${wins}胜${losses}负`;
}

function isStrongWinrateSignal(relation: AggregatedWinrateRelation, filters: AppFilters) {
  const rate = winrateRelationRate(relation);
  return relation.sample >= Math.max(filters.minSample, WINRATE_MIN_SAMPLE) && rate >= 0.5 + WINRATE_MIN_EDGE;
}

function buildStrongBpEvidence(
  relation: AggregatedBpRelation,
  data: AppData,
  filters: AppFilters,
  metricLookup: Map<string, HeroEventMetric>
): StrongBpEvidence | null {
  const action = bpEvidenceAction(relation.evidenceType);
  if (!action || relation.sample < Math.max(filters.minSample, BP_MIN_SAMPLE)) {
    return null;
  }

  const eventGroups = selectedEventGroups(data, filters);
  const selectedMatches = selectedEventMatchCount(data, eventGroups);
  const heroPickCount = heroActionCount(metricLookup, eventGroups, relation.heroAId, "pick");
  if (selectedMatches <= 0 || heroPickCount <= 0) {
    return null;
  }

  const conditionalRate = relation.sample / heroPickCount;
  const baselineRate = heroActionCount(metricLookup, eventGroups, relation.heroBId, action) / selectedMatches;
  const lift = conditionalRate - baselineRate;
  if (lift < BP_MIN_LIFT) {
    return null;
  }

  const label = evidenceLabels[relation.evidenceType] ?? relation.evidenceType;
  return {
    evidenceKey: relation.evidenceType,
    sample: relation.sample,
    conditionalRate,
    lift,
    score: lift * 1000 + conditionalRate * 100 + relation.sample / 1000,
    text: `${label} ${pct(conditionalRate)} · 高出均值 ${signedPct(lift)} · ${relation.sample}`
  };
}

function ensureMatchupTarget(targets: Map<number, MatchupTarget>, otherHeroId: number) {
  const existing = targets.get(otherHeroId);
  if (existing) {
    return existing;
  }
  const created: MatchupTarget = {
    otherHeroId,
    totalSample: 0,
    strongestScore: 0,
    detailTexts: [],
    detailMap: new Map<string, string>()
  };
  targets.set(otherHeroId, created);
  return created;
}

function addMatchupEvidence(
  targets: Map<number, MatchupTarget>,
  otherHeroId: number,
  evidenceKey: string,
  sample: number,
  text: string,
  score: number
) {
  const target = ensureMatchupTarget(targets, otherHeroId);
  if (!target.detailMap.has(evidenceKey)) {
    target.totalSample += sample;
  }
  target.strongestScore = Math.max(target.strongestScore, score);
  target.detailMap.set(evidenceKey, text);
}

function compactMatchupTargets(targets: Map<number, MatchupTarget>) {
  return Array.from(targets.values())
    .map((target) => ({
      ...target,
      detailTexts: Array.from(target.detailMap.values())
    }))
    .sort((a, b) => b.strongestScore - a.strongestScore || b.totalSample - a.totalSample || a.otherHeroId - b.otherHeroId)
    .slice(0, 3);
}

function buildRelationOverviewRows(data: AppData, rows: HeroPairRelation[], filters: AppFilters): MatchupHeroRow[] {
  const grouped = new Map<
    number,
    {
      heroId: number;
      counteredBy: Map<number, MatchupTarget>;
      synergies: Map<number, MatchupTarget>;
    }
  >();

  const ensureHero = (heroId: number) => {
    const existing = grouped.get(heroId);
    if (existing) {
      return existing;
    }
    const created = {
      heroId,
      counteredBy: new Map<number, MatchupTarget>(),
      synergies: new Map<number, MatchupTarget>()
    };
    grouped.set(heroId, created);
    return created;
  };

  aggregateWinrateRelations(rows).forEach((relation) => {
    if (!isStrongWinrateSignal(relation, filters)) {
      return;
    }
    const rate = winrateRelationRate(relation);
    if (relation.evidenceType === "vs_winrate_counter") {
      const hero = ensureHero(relation.heroBId);
      addMatchupEvidence(
        hero.counteredBy,
        relation.heroAId,
        relation.evidenceType,
        relation.sample,
        `对位 ${winLossText(relation.losses, relation.wins)}`,
        (rate - 0.5) * 1000 + relation.sample
      );
      return;
    }

    if (relation.evidenceType === "same_side_winrate_synergy") {
      const hero = ensureHero(relation.heroAId);
      addMatchupEvidence(
        hero.synergies,
        relation.heroBId,
        relation.evidenceType,
        relation.sample,
        `同阵 ${winLossText(relation.wins, relation.losses)}`,
        (rate - 0.5) * 1000 + relation.sample
      );
    }
  });

  const metricLookup = buildHeroEventMetricLookup(data);
  aggregateBpRelations(rows).forEach((relation) => {
    const evidence = buildStrongBpEvidence(relation, data, filters, metricLookup);
    if (!evidence) {
      return;
    }

    if (isCounterBpEvidence(relation.evidenceType)) {
      const hero = ensureHero(relation.heroAId);
      addMatchupEvidence(
        hero.counteredBy,
        relation.heroBId,
        evidence.evidenceKey,
        evidence.sample,
        evidence.text,
        evidence.score
      );
      return;
    }

    if (isSynergyBpEvidence(relation.evidenceType)) {
      const hero = ensureHero(relation.heroAId);
      addMatchupEvidence(
        hero.synergies,
        relation.heroBId,
        evidence.evidenceKey,
        evidence.sample,
        evidence.text,
        evidence.score
      );
    }
  });

  return Array.from(grouped.values())
    .map((hero) => {
      const counteredBy = compactMatchupTargets(hero.counteredBy);
      const synergies = compactMatchupTargets(hero.synergies);
      const allTargets = [...counteredBy, ...synergies];
      return {
        heroId: hero.heroId,
        counteredBy,
        synergies,
        totalSample: allTargets.reduce((sum, target) => sum + target.totalSample, 0),
        strongestScore: allTargets.reduce((max, target) => Math.max(max, target.strongestScore), 0)
      } satisfies MatchupHeroRow;
    })
    .filter((hero) => hero.counteredBy.length > 0 || hero.synergies.length > 0)
    .sort((a, b) => b.strongestScore - a.strongestScore || b.totalSample - a.totalSample || a.heroId - b.heroId);
}

function ensureGlobalRelationPair(
  pairs: Map<string, GlobalRelationPair>,
  relationType: GlobalRelationType,
  heroAId: number,
  heroBId: number
) {
  const key = `${relationType}:${heroAId}:${heroBId}`;
  const existing = pairs.get(key);
  if (existing) {
    return existing;
  }
  const created = {
    heroAId,
    heroBId,
    relationType,
    totalSample: 0,
    strongestScore: 0,
    detailTexts: [],
    detailMap: new Map<string, string>()
  } satisfies GlobalRelationPair;
  pairs.set(key, created);
  return created;
}

function addGlobalRelationEvidence(
  pairs: Map<string, GlobalRelationPair>,
  relationType: GlobalRelationType,
  heroAId: number,
  heroBId: number,
  evidenceKey: string,
  sample: number,
  text: string,
  score: number
) {
  const pair = ensureGlobalRelationPair(pairs, relationType, heroAId, heroBId);
  if (!pair.detailMap.has(evidenceKey)) {
    pair.totalSample += sample;
  }
  pair.strongestScore = Math.max(pair.strongestScore, score);
  pair.detailMap.set(evidenceKey, text);
}

function orderedSynergyPair(heroAId: number, heroBId: number) {
  return heroAId <= heroBId ? [heroAId, heroBId] : [heroBId, heroAId];
}

function buildGlobalRelationRows(
  data: AppData,
  rows: HeroPairRelation[],
  filters: AppFilters,
  relationType: GlobalRelationType
) {
  const pairs = new Map<string, GlobalRelationPair>();
  const heroById = new Map(data.heroes.map((hero) => [hero.hero_id, hero]));
  const name = (heroId: number) => heroPrimaryName(heroById.get(heroId));

  aggregateWinrateRelations(rows).forEach((relation) => {
    if (!isStrongWinrateSignal(relation, filters)) {
      return;
    }
    const rate = winrateRelationRate(relation);
    const score = (rate - 0.5) * 1000 + relation.sample;

    if (relationType === "counter" && relation.evidenceType === "vs_winrate_counter") {
      addGlobalRelationEvidence(
        pairs,
        "counter",
        relation.heroAId,
        relation.heroBId,
        `${relation.evidenceType}:${relation.heroAId}:${relation.heroBId}`,
        relation.sample,
        `${name(relation.heroAId)}对阵${name(relation.heroBId)}时${name(relation.heroAId)}方${winLossText(relation.wins, relation.losses)}`,
        score
      );
      return;
    }

    if (relationType === "synergy" && relation.evidenceType === "same_side_winrate_synergy") {
      const [heroAId, heroBId] = orderedSynergyPair(relation.heroAId, relation.heroBId);
      addGlobalRelationEvidence(
        pairs,
        "synergy",
        heroAId,
        heroBId,
        `${relation.evidenceType}:${heroAId}:${heroBId}`,
        relation.sample,
        `${name(relation.heroAId)}和${name(relation.heroBId)}同阵时己方${winLossText(relation.wins, relation.losses)}`,
        score
      );
    }
  });

  const metricLookup = buildHeroEventMetricLookup(data);
  aggregateBpRelations(rows).forEach((relation) => {
    const evidence = buildStrongBpEvidence(relation, data, filters, metricLookup);
    if (!evidence) {
      return;
    }

    if (relationType === "counter" && isCounterBpEvidence(relation.evidenceType)) {
      const text =
        relation.evidenceType === "own_ban_after_a_counter"
          ? `选出${name(relation.heroAId)}后己方ban掉${name(relation.heroBId)}${evidence.sample}次，高出本赛事均值${signedPct(evidence.lift)}`
          : `选出${name(relation.heroAId)}后对方选出${name(relation.heroBId)}${evidence.sample}次，高出本赛事均值${signedPct(evidence.lift)}`;
      addGlobalRelationEvidence(
        pairs,
        "counter",
        relation.heroBId,
        relation.heroAId,
        `${relation.evidenceType}:${relation.heroAId}:${relation.heroBId}`,
        evidence.sample,
        text,
        evidence.score
      );
      return;
    }

    if (relationType === "synergy" && isSynergyBpEvidence(relation.evidenceType)) {
      const [heroAId, heroBId] = orderedSynergyPair(relation.heroAId, relation.heroBId);
      const text =
        relation.evidenceType === "enemy_ban_after_a_synergy"
          ? `选出${name(relation.heroAId)}后对方ban掉${name(relation.heroBId)}${evidence.sample}次，高出本赛事均值${signedPct(evidence.lift)}`
          : `选出${name(relation.heroAId)}后己方选出${name(relation.heroBId)}${evidence.sample}次，高出本赛事均值${signedPct(evidence.lift)}`;
      addGlobalRelationEvidence(
        pairs,
        "synergy",
        heroAId,
        heroBId,
        `${relation.evidenceType}:${relation.heroAId}:${relation.heroBId}`,
        evidence.sample,
        text,
        evidence.score
      );
    }
  });

  return Array.from(pairs.values())
    .map((pair) => ({
      ...pair,
      detailTexts: Array.from(pair.detailMap.values())
    }))
    .sort((a, b) => b.strongestScore - a.strongestScore || b.totalSample - a.totalSample || a.heroAId - b.heroAId || a.heroBId - b.heroBId)
    .slice(0, GLOBAL_RELATION_LIMIT);
}

interface HeroRelationDetailSectionBuilder extends HeroRelationDetailSection {
  itemMap: Map<number, HeroRelationDetailItem & { detailMap: Map<string, string> }>;
}

function ensureDetailSection(
  grouped: Map<HeroRelationGroupKey, Map<string, HeroRelationDetailSectionBuilder>>,
  groupKey: HeroRelationGroupKey,
  sectionKey: string
) {
  const sectionGroup = grouped.get(groupKey) ?? new Map<string, HeroRelationDetailSectionBuilder>();
  grouped.set(groupKey, sectionGroup);

  const existing = sectionGroup.get(sectionKey);
  if (existing) {
    return existing;
  }
  const definition = heroRelationSectionDefinitions[groupKey].find((section) => section.key === sectionKey);
  const created = {
    key: sectionKey,
    title: definition?.title ?? sectionKey,
    items: [],
    itemMap: new Map<number, HeroRelationDetailItem & { detailMap: Map<string, string> }>()
  } satisfies HeroRelationDetailSectionBuilder;
  sectionGroup.set(sectionKey, created);
  return created;
}

function ensureDetailSectionItem(section: HeroRelationDetailSectionBuilder, groupKey: HeroRelationGroupKey, otherHeroId: number) {
  const existing = section.itemMap.get(otherHeroId);
  if (existing) {
    return existing;
  }
  const created = {
    otherHeroId,
    groupKey,
    totalSample: 0,
    strongestRate: 0,
    hasWinningEvidence: false,
    detailTexts: [],
    detailMap: new Map<string, string>()
  } satisfies HeroRelationDetailItem & { detailMap: Map<string, string> };
  section.itemMap.set(otherHeroId, created);
  return created;
}

function addDetailEvidence(
  grouped: Map<HeroRelationGroupKey, Map<string, HeroRelationDetailSectionBuilder>>,
  groupKey: HeroRelationGroupKey,
  sectionKey: string,
  otherHeroId: number,
  evidenceKey: string,
  sample: number,
  text: string,
  score: number,
  hasWinningEvidence: boolean
) {
  const section = ensureDetailSection(grouped, groupKey, sectionKey);
  const item = ensureDetailSectionItem(section, groupKey, otherHeroId);
  if (!item.detailMap.has(evidenceKey)) {
    item.totalSample += sample;
  } else {
    item.totalSample = Math.max(item.totalSample, sample);
  }
  item.strongestRate = Math.max(item.strongestRate, score);
  item.hasWinningEvidence = item.hasWinningEvidence || hasWinningEvidence;
  item.detailMap.set(evidenceKey, text);
}

function relationWinrateScore(wins: number, losses: number) {
  const sample = wins + losses;
  return sample > 0 ? (Math.abs(wins - losses) / sample) * 1000 + sample / 1000 : 0;
}

function buildHeroRelationDetailItems(heroId: number, data: AppData, filters: AppFilters): HeroRelationDetailGroups {
  const grouped = new Map<HeroRelationGroupKey, Map<string, HeroRelationDetailSectionBuilder>>();
  const rows = data.heroPairRelations.filter((row) => eventMatches(filters, row.event_group));
  const minSample = Math.max(0, filters.minSample);
  const heroById = new Map(data.heroes.map((hero) => [hero.hero_id, hero]));
  const name = (targetHeroId: number) => heroPrimaryName(heroById.get(targetHeroId));
  const selectedHeroName = name(heroId);

  aggregateWinrateRelations(rows).forEach((relation) => {
    if (relation.sample < minSample) {
      return;
    }

    if (relation.evidenceType === "vs_winrate_counter") {
      if (relation.heroBId === heroId && relation.losses < relation.wins) {
        addDetailEvidence(
          grouped,
          "countered_by",
          "low_vs_winrate",
          relation.heroAId,
          relation.evidenceType,
          relation.sample,
          `${selectedHeroName}对阵${name(relation.heroAId)}时己方${winLossText(relation.losses, relation.wins)}`,
          relationWinrateScore(relation.losses, relation.wins),
          true
        );
      }
      if (relation.heroAId === heroId && relation.wins > relation.losses) {
        addDetailEvidence(
          grouped,
          "counters",
          "high_vs_winrate",
          relation.heroBId,
          relation.evidenceType,
          relation.sample,
          `${selectedHeroName}对阵${name(relation.heroBId)}时己方${winLossText(relation.wins, relation.losses)}`,
          relationWinrateScore(relation.wins, relation.losses),
          true
        );
      }
      return;
    }

    if (relation.evidenceType === "same_side_winrate_synergy" && relation.wins !== relation.losses) {
      const isWinningPair = relation.wins > relation.losses;
      const groupKey: HeroRelationGroupKey = isWinningPair ? "synergies" : "anti_synergies";
      const sectionKey = isWinningPair ? "same_side_winrate" : "same_side_lossrate";
      const score = relationWinrateScore(relation.wins, relation.losses);
      if (relation.heroAId === heroId) {
        addDetailEvidence(
          grouped,
          groupKey,
          sectionKey,
          relation.heroBId,
          relation.evidenceType,
          relation.sample,
          `选出${selectedHeroName}和${name(relation.heroBId)}后己方${winLossText(relation.wins, relation.losses)}`,
          score,
          isWinningPair
        );
      }
      if (relation.heroBId === heroId) {
        addDetailEvidence(
          grouped,
          groupKey,
          sectionKey,
          relation.heroAId,
          relation.evidenceType,
          relation.sample,
          `选出${selectedHeroName}和${name(relation.heroAId)}后己方${winLossText(relation.wins, relation.losses)}`,
          score,
          isWinningPair
        );
      }
    }
  });

  aggregateBpRelations(rows).forEach((relation) => {
    if (relation.sample < minSample) {
      return;
    }
    const evidenceType = relation.evidenceType;
    const score = relation.sample;

    if (evidenceType === "own_ban_after_a_counter") {
      if (relation.heroAId === heroId) {
        addDetailEvidence(
          grouped,
          "countered_by",
          "ban_after_a",
          relation.heroBId,
          evidenceType,
          relation.sample,
          `选出${selectedHeroName}后己方ban掉${name(relation.heroBId)}${relation.sample}次`,
          score,
          false
        );
      }
      if (relation.heroBId === heroId) {
        addDetailEvidence(
          grouped,
          "counters",
          "ban_a_after_enemy_b",
          relation.heroAId,
          evidenceType,
          relation.sample,
          `对方选出${name(relation.heroAId)}后己方ban掉${selectedHeroName}${relation.sample}次`,
          score,
          false
        );
      }
      return;
    }

    if (evidenceType === "enemy_pick_after_a_counter") {
      if (relation.heroAId === heroId) {
        addDetailEvidence(
          grouped,
          "countered_by",
          "enemy_pick_after_a",
          relation.heroBId,
          evidenceType,
          relation.sample,
          `选出${selectedHeroName}后对方选出${name(relation.heroBId)}${relation.sample}次`,
          score,
          false
        );
      }
      if (relation.heroBId === heroId) {
        addDetailEvidence(
          grouped,
          "counters",
          "ally_pick_after_enemy_b",
          relation.heroAId,
          evidenceType,
          relation.sample,
          `对方选出${name(relation.heroAId)}后己方选出${selectedHeroName}${relation.sample}次`,
          score,
          false
        );
      }
      return;
    }

    if (evidenceType === "enemy_ban_after_a_synergy" && relation.heroAId === heroId) {
      addDetailEvidence(
        grouped,
        "synergies",
        "enemy_ban_after_a",
        relation.heroBId,
        evidenceType,
        relation.sample,
        `选出${selectedHeroName}后对方ban掉${name(relation.heroBId)}${relation.sample}次`,
        score,
        false
      );
      addDetailEvidence(
        grouped,
        "synergies",
        "ally_ban_after_enemy_a",
        relation.heroBId,
        `${evidenceType}:ally`,
        relation.sample,
        `对方选出${selectedHeroName}后己方ban掉${name(relation.heroBId)}${relation.sample}次`,
        score,
        false
      );
    }
  });

  const result: HeroRelationDetailGroups = {
    countered_by: [],
    counters: [],
    synergies: [],
    anti_synergies: []
  };

  Object.entries(heroRelationSectionDefinitions).forEach(([groupKey, definitions]) => {
    const typedGroupKey = groupKey as HeroRelationGroupKey;
    const sectionGroup = grouped.get(typedGroupKey);
    result[typedGroupKey] = definitions.map((definition) => {
      const section = sectionGroup?.get(definition.key);
      const items = Array.from(section?.itemMap.values() ?? [])
        .map((item) => ({
          otherHeroId: item.otherHeroId,
          groupKey: item.groupKey,
          totalSample: item.totalSample,
          strongestRate: item.strongestRate,
          hasWinningEvidence: item.hasWinningEvidence,
          detailTexts: Array.from(item.detailMap.values())
        }))
        .sort(
          (a, b) =>
            b.strongestRate - a.strongestRate ||
            b.totalSample - a.totalSample ||
            Number(b.hasWinningEvidence) - Number(a.hasWinningEvidence) ||
            a.otherHeroId - b.otherHeroId
        );
      return {
        key: definition.key,
        title: definition.title,
        items
      } satisfies HeroRelationDetailSection;
    });
  });

  return result;
}

function buildRecentHeatRows(heroId: number, data: AppData): HeroRecentHeatRow[] {
  const eventOrder = orderedEvents(data);
  const cutoff = threeMonthsBefore(latestEventDate(data));

  return eventOrder
    .map((event, index) => {
      const metric = data.heroEventMetrics.find(
        (row) => row.hero_id === heroId && row.event_group === event.event_group
      );
      if (!metric) {
        return null;
      }
      const previousEvent = index > 0 ? eventOrder[index - 1].event_group : "";
      const previousMetric = previousEvent
        ? data.heroEventMetrics.find((row) => row.hero_id === heroId && row.event_group === previousEvent)
        : undefined;
      const eventDate = new Date(event.last_match || event.first_match);
      if (!Number.isFinite(eventDate.getTime()) || eventDate < cutoff) {
        return null;
      }
      return {
        ...metric,
        delta: previousMetric ? metric.heat_rate - previousMetric.heat_rate : null,
        previousEvent: previousMetric ? previousEvent : "样本外",
        eventDate: event.last_match || event.first_match
      } satisfies HeroRecentHeatRow;
    })
    .filter((row): row is HeroRecentHeatRow => row !== null)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

function HeroRelationGroupSection({
  groupKey,
  sections,
  tools
}: {
  groupKey: HeroRelationGroupKey;
  sections: HeroRelationDetailSection[];
  tools: ReturnType<typeof useHeroTools>;
}) {
  return (
    <section className="hero-relation-group">
      <h4>{relationGroupLabels[groupKey]}</h4>
      <div className="hero-relation-section-list">
        {sections.map((section) => (
          <section className="hero-relation-section" key={`${groupKey}-${section.key}`}>
            <h5>{section.title}</h5>
            {section.items.length === 0 ? (
              <p className="empty-note">当前筛选下暂无关系。</p>
            ) : (
              <div className="hero-relation-card-list">
                {section.items.slice(0, 3).map((item) => (
                  <article className="hero-relation-card" key={`${groupKey}-${section.key}-${item.otherHeroId}`}>
                    <div className="hero-relation-card-title">
                      <HeroAvatar heroId={item.otherHeroId} tools={tools} />
                      <strong>{tools.label(item.otherHeroId)}</strong>
                      <b>{item.totalSample}</b>
                    </div>
                    <div className="evidence-chip-list">
                      {item.detailTexts.map((text) => (
                        <span className="evidence-chip" key={text}>
                          {text}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function RecentHeatPanel({ rows }: { rows: HeroRecentHeatRow[] }) {
  return (
    <section className="hero-relation-group hero-heat-group">
      <h4>最近 3 个月热度变化</h4>
      {rows.length === 0 ? (
        <p className="empty-note">最近 3 个月暂无该英雄热度样本。</p>
      ) : (
        <div className="stack-list">
          {rows.map((row) => (
            <div className="rank-row" key={`${row.event_group}-${row.hero_id}-recent-heat`}>
              <div>
                <strong>{row.event_group}</strong>
                <span>
                  {row.previousEvent} → {row.event_group}
                </span>
              </div>
              <div className={row.delta === null ? "delta" : row.delta >= 0 ? "delta up" : "delta down"}>
                {pct(row.heat_rate)} · {row.delta === null ? "样本外" : signedPct(row.delta)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HeroRelationDetailPanel({
  heroId,
  data,
  filters,
  tools,
  onClose
}: {
  heroId: number;
  data: AppData;
  filters: AppFilters;
  tools: ReturnType<typeof useHeroTools>;
  onClose: () => void;
}) {
  const groups = useMemo(
    () => buildHeroRelationDetailItems(heroId, data, filters),
    [heroId, data, filters]
  );
  const [activeDetailTab, setActiveDetailTab] = useState<HeroDetailTabKey>("countered_by");

  return (
    <section className="hero-detail-panel" aria-label={`${tools.primaryName(heroId)}关系详情`}>
      <div className="hero-detail-header">
        <div className="hero-detail-title">
          <HeroAvatar heroId={heroId} tools={tools} large />
          <div>
            <h3>{tools.primaryName(heroId)}关系详情</h3>
            <p>{tools.label(heroId)}</p>
          </div>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="关闭英雄关系详情">
          ×
        </button>
      </div>

      <div className="hero-detail-tabs" role="tablist" aria-label={`${tools.primaryName(heroId)}详情标签`}>
        {heroDetailTabs.map((tab) => (
          <button
            key={tab.key}
            aria-selected={activeDetailTab === tab.key}
            className={activeDetailTab === tab.key ? "detail-tab active" : "detail-tab"}
            onClick={() => setActiveDetailTab(tab.key)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="hero-detail-groups">
        <HeroRelationGroupSection groupKey={activeDetailTab} sections={groups[activeDetailTab]} tools={tools} />
      </div>
    </section>
  );
}

function BarValue({ value }: { value: number }) {
  return (
    <div className="bar-value">
      <span style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      <strong>{pct(value)}</strong>
    </div>
  );
}

function MovementPanel({
  data,
  filters,
  tools,
  selectedHeroId,
  onSelectHero
}: {
  data: AppData;
  filters: AppFilters;
  tools: ReturnType<typeof useHeroTools>;
  selectedHeroId: number | null;
  onSelectHero: (heroId: number | null) => void;
}) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const rows = useMemo(() => {
    const eventOrder = selectedEvents(data, filters);
    const baselineEvent = eventOrder[0]?.event_group ?? "";
    const targetEvent = eventOrder[eventOrder.length - 1]?.event_group;

    return data.heroEventMetrics
      .filter((metric) => metric.event_group === targetEvent)
      .filter((metric) => metricPassesFilters(metric, { ...filters, eventGroups: targetEvent ? [targetEvent] : [] }, tools))
      .map((metric) => {
        const baseline =
          data.heroEventMetrics.find((row) => row.hero_id === metric.hero_id && row.event_group === baselineEvent)
            ?.heat_rate ?? 0;
        return { ...metric, delta: metric.heat_rate - baseline, baseline_event: baselineEvent || "样本外" };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [data, filters, tools]);

  const risingRows = rows.filter((row) => row.delta >= MOVEMENT_MIN_ABS_DELTA);
  const fallingRows = rows.filter((row) => row.delta <= -MOVEMENT_MIN_ABS_DELTA);

  return (
    <>
      <section className="dual-grid">
        <MovementList
          title="最早至最晚热度上升"
          icon={ArrowUpRight}
          rows={risingRows}
          data={data}
          filters={filters}
          tools={tools}
          selectedRowKey={selectedRowKey}
          onSelectRow={setSelectedRowKey}
          selectedHeroId={selectedHeroId}
          onSelectHero={onSelectHero}
        />
        <MovementList
          title="最早至最晚热度下降"
          icon={ArrowDownRight}
          rows={fallingRows}
          data={data}
          filters={filters}
          tools={tools}
          selectedRowKey={selectedRowKey}
          onSelectRow={setSelectedRowKey}
          selectedHeroId={selectedHeroId}
          onSelectHero={onSelectHero}
        />
      </section>
    </>
  );
}

function MovementList({
  title,
  icon: Icon,
  rows,
  data,
  filters,
  tools,
  selectedRowKey,
  onSelectRow,
  selectedHeroId,
  onSelectHero
}: {
  title: string;
  icon: typeof ArrowUpRight;
  rows: HeroMovementRow[];
  data: AppData;
  filters: AppFilters;
  tools: ReturnType<typeof useHeroTools>;
  selectedRowKey: string | null;
  onSelectRow: (rowKey: string | null) => void;
  selectedHeroId: number | null;
  onSelectHero: (heroId: number | null) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <Icon aria-hidden="true" size={18} />
          <h2>{title}</h2>
        </div>
        <span>当前热度 / 变化</span>
      </div>
      <div className="stack-list">
        {rows.length === 0 ? (
          <p className="empty-note">当前筛选下没有超过 10% 的热度变化。</p>
        ) : rows.map((row) => {
          const rowKey = `${row.event_group}-${row.hero_id}-${title}`;
          const rowSelected = selectedHeroId === row.hero_id && selectedRowKey === rowKey;
          return (
          <Fragment key={rowKey}>
            <div className="rank-row">
              <div>
                <HeroAvatarButton
                  heroId={row.hero_id}
                  tools={tools}
                  selected={rowSelected}
                  onClick={() => {
                    onSelectRow(rowSelected ? null : rowKey);
                    onSelectHero(rowSelected ? null : row.hero_id);
                  }}
                />
                <span>
                  {row.baseline_event} → {row.event_group}
                </span>
              </div>
              <div className={row.delta >= 0 ? "delta up" : "delta down"}>
              {pct(row.heat_rate)} · {signedPct(row.delta)}
              </div>
            </div>
            {rowSelected && (
              <div className="movement-detail-row">
                <HeroRelationDetailPanel
                  heroId={row.hero_id}
                  data={data}
                  filters={filters}
                  tools={tools}
                  onClose={() => {
                    onSelectRow(null);
                    onSelectHero(null);
                  }}
                />
              </div>
            )}
          </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function RelationsPanel({
  data,
  filters,
  tools
}: {
  data: AppData;
  filters: AppFilters;
  tools: ReturnType<typeof useHeroTools>;
}) {
  const rows = data.heroPairRelations
    .filter((row) => eventMatches(filters, row.event_group))
    .filter((row) => !filters.heroSearch || tools.searchHit(row.hero_a_id, filters.heroSearch) || tools.searchHit(row.hero_b_id, filters.heroSearch))
    .sort((a, b) => b.sample_size - a.sample_size || (b.rate ?? 0) - (a.rate ?? 0));
  const counterRows = buildGlobalRelationRows(data, rows, filters, "counter");
  const synergyRows = buildGlobalRelationRows(data, rows, filters, "synergy");

  return (
    <section className="relations-layout dual-grid">
      <GlobalRelationList
        title="显著克制 Top 30"
        subtitle="全部克制线索综合排序"
        rows={counterRows}
        tools={tools}
      />
      <GlobalRelationList
        title="显著配合 Top 30"
        subtitle="全部配合线索综合排序"
        rows={synergyRows}
        tools={tools}
      />
    </section>
  );
}

function GlobalRelationList({
  title,
  subtitle,
  rows,
  tools
}: {
  title: string;
  subtitle: string;
  rows: GlobalRelationPair[];
  tools: ReturnType<typeof useHeroTools>;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <GitCompare aria-hidden="true" size={18} />
          <h2>{title}</h2>
        </div>
        <span>{subtitle}</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty-note">当前筛选下暂无可展示的显著关系。</p>
      ) : (
        <ol className="global-relation-list">
          {rows.map((row, index) => (
            <li className="global-relation-row" key={`${row.relationType}-${row.heroAId}-${row.heroBId}`}>
              <div className="global-relation-title">
                <span className="event-hero-rank">{index + 1}</span>
                <div className="global-relation-heroes">
                  <HeroAvatar heroId={row.heroAId} tools={tools} />
                  <strong>{tools.label(row.heroAId)}</strong>
                  <span>{row.relationType === "counter" ? "克制" : "配合"}</span>
                  <HeroAvatar heroId={row.heroBId} tools={tools} />
                  <strong>{tools.label(row.heroBId)}</strong>
                </div>
                <b>{row.totalSample}</b>
              </div>
              <div className="evidence-chip-list">
                {row.detailTexts.map((text) => (
                  <span className="evidence-chip" key={text}>
                    {text}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BpSequenceEvidencePanel({
  rows,
  tools
}: {
  rows: HeroPairRelation[];
  tools: ReturnType<typeof useHeroTools>;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <GitCompare aria-hidden="true" size={18} />
          <h2>BP 时序证据</h2>
        </div>
        <span>A 先选后的对方选 / 己方 Ban / 对方 Ban</span>
      </div>
      <div className="stack-list sequence-list">
        {rows.map((row) => (
          <div className="relation-row" key={`${row.event_group}-${row.hero_a_id}-${row.hero_b_id}-${row.evidence_type}`}>
            <div>
              <strong>{tools.label(row.hero_a_id)}</strong>
              <span>{evidenceLabels[row.evidence_type] ?? row.evidence_type}</span>
              <strong>{tools.label(row.hero_b_id)}</strong>
            </div>
            <div>
              <b>{row.sample_size}</b>
              <span>{relationLabel(row.relation_type)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RelationList({
  title,
  rows,
  tools
}: {
  title: string;
  rows: HeroPairRelation[];
  tools: ReturnType<typeof useHeroTools>;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <GitCompare aria-hidden="true" size={18} />
          <h2>{title}</h2>
        </div>
        <span>样本 / 证据</span>
      </div>
      <div className="stack-list">
        {rows.map((row) => (
          <div className="relation-row" key={`${row.event_group}-${row.hero_a_id}-${row.hero_b_id}-${row.evidence_type}`}>
            <div>
              <strong>{tools.label(row.hero_a_id)}</strong>
              <span>{relationLabel(row.relation_type)}</span>
              <strong>{tools.label(row.hero_b_id)}</strong>
            </div>
            <div>
              <b>{row.sample_size}</b>
              <span>{evidenceLabels[row.evidence_type] ?? row.evidence_type}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BpLaningPanel({
  data,
  filters,
  tools
}: {
  data: AppData;
  filters: AppFilters;
  tools: ReturnType<typeof useHeroTools>;
}) {
  const rows = useMemo(() => {
    const eventOrder = selectedEvents(data, filters);
    const baselineEvent = eventOrder[0]?.event_group ?? "";
    const latestEvent = eventOrder[eventOrder.length - 1]?.event_group ?? "";
    return data.heroEventMetrics
      .filter((row) => row.event_group === latestEvent)
      .filter((row) => metricPassesFilters(row, { ...filters, eventGroups: latestEvent ? [latestEvent] : [] }, tools))
      .map((row) => {
        const baseline =
          data.heroEventMetrics.find((metric) => metric.hero_id === row.hero_id && metric.event_group === baselineEvent)
            ?.heat_rate ?? 0;
        return { ...row, delta: row.heat_rate - baseline, baseline_event: baselineEvent } satisfies HeroBpTrendRow;
      })
      .sort(
        (a, b) =>
          b.heat_rate - a.heat_rate ||
          b.first_phase_contest_rate - a.first_phase_contest_rate ||
          a.hero_id - b.hero_id
      );
  }, [data, filters, tools]);

  const firstBanRows = rows.filter((row) => (row.first_ban ?? 0) > 0);
  const firstPickRows = rows.filter((row) => (row.first_pick ?? 0) > 0);

  return (
    <section className="dual-grid">
      <FirstPhaseTrendList
        title="首轮被 Ban 英雄"
        subtitle="最近赛事热度 / 相比最早赛事"
        rows={firstBanRows}
        tools={tools}
        countLabel={(row) => `首轮 Ban ${row.first_ban ?? 0}`}
      />
      <FirstPhaseTrendList
        title="首轮被选英雄"
        subtitle="最近赛事热度 / 首轮选择胜率"
        rows={firstPickRows}
        tools={tools}
        countLabel={(row) => `首轮 Pick ${row.first_pick ?? 0}`}
        showPickWinrate
      />
    </section>
  );
}

function FirstPhaseTrendList({
  title,
  subtitle,
  rows,
  tools,
  countLabel,
  showPickWinrate = false
}: {
  title: string;
  subtitle: string;
  rows: HeroBpTrendRow[];
  tools: ReturnType<typeof useHeroTools>;
  countLabel: (row: HeroBpTrendRow) => string;
  showPickWinrate?: boolean;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <Swords aria-hidden="true" size={18} />
          <h2>{title}</h2>
        </div>
        <span>{subtitle}</span>
      </div>
      <div className="stack-list">
        {rows.length === 0 ? (
          <p className="empty-note">当前筛选下暂无首轮 BP 样本。</p>
        ) : (
          rows.map((row) => (
            <div className="rank-row" key={`${title}-${row.event_group}-${row.hero_id}`}>
              <div>
                <HeroAvatar heroId={row.hero_id} tools={tools} />
                <strong>{tools.label(row.hero_id)}</strong>
                <span>
                  {row.baseline_event} → {row.event_group}
                </span>
              </div>
              <div className="first-phase-metrics">
                <b>{countLabel(row)}</b>
                <span className={row.delta >= 0 ? "delta up" : "delta down"}>
                  {pct(row.heat_rate)} · {signedPct(row.delta)}
                </span>
                {showPickWinrate && <span>首轮选择胜率 {pct(row.win_rate)}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
