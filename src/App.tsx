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
  HeroLaningRelation,
  HeroPairRelation,
  HeroPositionMetric
} from "./data/contracts";
import { defaultFilters, parseFilters, serializeFilters, type AppFilters, type TabKey } from "./data/filters";

const numberFormat = new Intl.NumberFormat("zh-CN");

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "heroes", label: "英雄热度" },
  { key: "movement", label: "热度变化" },
  { key: "relations", label: "克制配合" },
  { key: "bp_laning", label: "首轮 BP 与对线" }
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

const bpSequenceEvidenceTypes = new Set([
  "enemy_pick_after_a_counter",
  "own_ban_after_a_counter",
  "enemy_ban_after_a_synergy"
]);

const sameSidePickAfterASynergyEvidenceTypes = new Set([
  "same_side_pick_after_a_synergy",
  "ally_pick_after_a_synergy"
]);

const relationGroupLabels: Record<HeroRelationGroupKey, string> = {
  countered_by: "克制该英雄",
  counters: "该英雄克制",
  synergized_by: "配合该英雄",
  synergizes: "该英雄配合"
};

const heroDetailTabs: Array<{ key: HeroDetailTabKey; label: string }> = [
  { key: "counters", label: "克制" },
  { key: "synergies", label: "配合" },
  { key: "heat", label: "近3个月热度" }
];

type HeroRelationGroupKey = "countered_by" | "counters" | "synergized_by" | "synergizes";
type HeroDetailTabKey = "counters" | "synergies" | "heat";

interface HeroRelationDetailItem {
  otherHeroId: number;
  groupKey: HeroRelationGroupKey;
  totalSample: number;
  strongestRate: number;
  hasWinningEvidence: boolean;
  detailTexts: string[];
}

interface HeroMovementRow extends HeroEventMetric {
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
    const primaryName = (heroId: number) => label(heroId).split(" / ")[0] || `Hero ${heroId}`;
    const imageUrl = (heroId: number) => heroImageUrl(heroById.get(heroId));
    const searchHit = (heroId: number, query: string) => {
      const text = `${label(heroId)} ${heroId}`.toLowerCase();
      return text.includes(query.trim().toLowerCase());
    };
    const positionSummary = (eventGroup: string, heroId: number) => {
      const rows = positionByHeroEvent.get(`${eventGroup}|${heroId}`) ?? [];
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
  return positions.some((row) => {
    const positionOk = filters.position === "all" || String(row.position) === filters.position;
    const confidenceOk = filters.confidence === "all" || row.confidence_flag === filters.confidence;
    return positionOk && confidenceOk;
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

  const filteredMetrics = data.heroEventMetrics
    .filter((metric) => metricPassesFilters(metric, effectiveFilters, tools))
    .sort((a, b) => b.heat_rate - a.heat_rate || b.pick_count + b.ban_count - (a.pick_count + a.ban_count));

  const totalMatches = data.dataQuality.totals.matches;
  const bpRate = data.dataQuality.totals.bp_matches / Math.max(totalMatches, 1);
  const rawPositionRate = data.dataQuality.totals.raw_position_matches / Math.max(totalMatches, 1);

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
        <QualityPanel data={data} rawPositionRate={rawPositionRate} />

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
            rows={filteredMetrics.slice(0, 24)}
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
  const update = (patch: Partial<AppFilters>) => onChange({ ...filters, ...patch });
  const eventOrder = orderedEvents(data);
  const selectedSet = new Set(filters.eventGroups);
  const toggleEvent = (eventGroup: string) => {
    const isSelected = selectedSet.has(eventGroup);
    if (isSelected && filters.eventGroups.length <= 2) {
      return;
    }
    const nextSelection = isSelected
      ? filters.eventGroups.filter((selected) => selected !== eventGroup)
      : [...filters.eventGroups, eventGroup];
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
            className={filters.position === position ? "active" : ""}
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
          value={filters.confidence}
          onChange={(event) => update({ confidence: event.target.value as AppFilters["confidence"] })}
        >
          <option value="all">全部</option>
          <option value="confirmed">确认</option>
          <option value="derived">推断</option>
          <option value="mixed">混合</option>
        </select>
      </label>

      <label>
        <span>变化基线</span>
        <select
          value={filters.baseline}
          onChange={(event) => update({ baseline: event.target.value as AppFilters["baseline"] })}
        >
          <option value="previous_event">相邻赛事</option>
          <option value="sample_average">样本均值</option>
        </select>
      </label>

      <label>
        <span>最小样本</span>
        <input
          min={1}
          max={30}
          type="number"
          value={filters.minSample}
          onChange={(event) => update({ minSample: Number(event.target.value) || 1 })}
        />
      </label>

      <label className="search-box">
        <Search aria-hidden="true" size={16} />
        <input
          value={filters.heroSearch}
          onChange={(event) => update({ heroSearch: event.target.value })}
          placeholder="英雄"
        />
      </label>
    </section>
  );
}

function QualityPanel({ data, rawPositionRate }: { data: AppData; rawPositionRate: number }) {
  const issueTypes = Object.entries(data.dataQuality.issue_summary)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" / ");
  return (
    <section className="quality-strip" aria-label="data quality">
      <div>
        <strong>{pct(rawPositionRate)}</strong>
        <span>原始位置覆盖</span>
      </div>
      <div>
        <strong>{numberFormat.format(data.dataQuality.totals.confirmed_position_matches)}</strong>
        <span>确认位置场次</span>
      </div>
      <div>
        <strong>{data.dataQuality.totals.issue_count}</strong>
        <span>{issueTypes || "无结构化异常"}</span>
      </div>
    </section>
  );
}

function HeroRankingPanel({
  data,
  rows,
  tools,
  filters,
  selectedHeroId,
  onSelectHero
}: {
  data: AppData;
  rows: HeroEventMetric[];
  tools: ReturnType<typeof useHeroTools>;
  filters: AppFilters;
  selectedHeroId: number | null;
  onSelectHero: (heroId: number | null) => void;
}) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <ListFilter aria-hidden="true" size={18} />
          <h2>热门英雄</h2>
        </div>
        <span>Pick + Ban / Match</span>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>英雄</th>
              <th>赛事</th>
              <th>热度</th>
              <th>Pick</th>
              <th>Ban</th>
              <th>胜率</th>
              <th>首轮 BP</th>
              <th>位置</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowKey = `${row.event_group}-${row.hero_id}`;
              const rowSelected = selectedHeroId === row.hero_id && selectedRowKey === rowKey;
              return (
                <Fragment key={rowKey}>
                  <tr>
                  <td className="hero-cell">
                    <HeroAvatarButton
                      heroId={row.hero_id}
                      tools={tools}
                      selected={rowSelected}
                      onClick={() => {
                        setSelectedRowKey(rowSelected ? null : rowKey);
                        onSelectHero(rowSelected ? null : row.hero_id);
                      }}
                    />
                  </td>
                  <td>{row.event_group}</td>
                  <td>
                    <BarValue value={row.heat_rate} />
                  </td>
                  <td>{row.pick_count}</td>
                  <td>{row.ban_count}</td>
                  <td>{pct(row.win_rate)}</td>
                  <td>{pct(row.first_phase_contest_rate)}</td>
                  <td>{tools.positionSummary(row.event_group, row.hero_id) || "-"}</td>
                </tr>
                  {rowSelected && (
                    <tr className="hero-detail-table-row">
                      <td colSpan={8}>
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
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
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

function classifyRelation(row: HeroPairRelation, heroId: number): { groupKey: HeroRelationGroupKey; otherHeroId: number } | null {
  if (
    (row.evidence_type === "enemy_pick_after_a_counter" || row.evidence_type === "own_ban_after_a_counter") &&
    row.hero_a_id === heroId
  ) {
    return { groupKey: "countered_by", otherHeroId: row.hero_b_id };
  }
  if (
    (row.evidence_type === "enemy_pick_after_a_counter" || row.evidence_type === "own_ban_after_a_counter") &&
    row.hero_b_id === heroId
  ) {
    return { groupKey: "counters", otherHeroId: row.hero_a_id };
  }
  if (row.relation_type === "counter" && row.hero_b_id === heroId) {
    return { groupKey: "countered_by", otherHeroId: row.hero_a_id };
  }
  if (row.relation_type === "counter" && row.hero_a_id === heroId) {
    return { groupKey: "counters", otherHeroId: row.hero_b_id };
  }
  if (row.relation_type === "synergy" && row.hero_b_id === heroId) {
    return { groupKey: "synergized_by", otherHeroId: row.hero_a_id };
  }
  if (row.relation_type === "synergy" && row.hero_a_id === heroId) {
    return { groupKey: "synergizes", otherHeroId: row.hero_b_id };
  }
  return null;
}

function evidenceDetailText(row: HeroPairRelation) {
  if (row.evidence_type === "vs_winrate_counter") {
    return `对位 ${row.wins ?? 0}胜${row.losses ?? 0}负`;
  }
  if (row.evidence_type === "same_side_winrate_synergy") {
    return `同阵 ${row.wins ?? 0}胜${row.losses ?? 0}负`;
  }
  return `${evidenceLabels[row.evidence_type] ?? row.evidence_type} ${row.sample_size}`;
}

const winningEvidenceTypes = new Set(["vs_winrate_counter", "same_side_winrate_synergy"]);

function isWinningEvidence(row: HeroPairRelation) {
  return winningEvidenceTypes.has(row.evidence_type);
}

function isStrongRelationEvidence(row: HeroPairRelation) {
  if (row.confidence_flag !== "ok") {
    return false;
  }
  const rate = row.rate ?? 0;
  if (isWinningEvidence(row)) {
    return row.sample_size >= 8 && rate >= 0.6;
  }
  if (bpSequenceEvidenceTypes.has(row.evidence_type)) {
    return row.sample_size >= 10 && rate >= 0.7;
  }
  return false;
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
  row: HeroPairRelation,
  text: string,
  score: number
) {
  const target = ensureMatchupTarget(targets, otherHeroId);
  const evidenceKey = row.evidence_type;
  if (!target.detailMap.has(evidenceKey)) {
    target.totalSample += row.sample_size;
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

function buildRelationOverviewRows(rows: HeroPairRelation[]): MatchupHeroRow[] {
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

  rows.forEach((row) => {
    if (row.confidence_flag !== "ok") {
      return;
    }
    const rate = row.rate ?? 0;
    if (row.evidence_type === "vs_winrate_counter" && rate >= 0.5) {
      const hero = ensureHero(row.hero_b_id);
      const heroWinRate = 1 - rate;
      addMatchupEvidence(
        hero.counteredBy,
        row.hero_a_id,
        row,
        `对位A方胜率 ${pct(heroWinRate)} · ${row.sample_size}`,
        rate * 1000 + row.sample_size
      );
      return;
    }

    if (row.evidence_type === "own_ban_after_a_counter") {
      const hero = ensureHero(row.hero_a_id);
      addMatchupEvidence(
        hero.counteredBy,
        row.hero_b_id,
        row,
        `先选后己方 Ban ${row.sample_size}`,
        row.sample_size
      );
      return;
    }

    if (row.evidence_type === "enemy_pick_after_a_counter") {
      const hero = ensureHero(row.hero_a_id);
      addMatchupEvidence(
        hero.counteredBy,
        row.hero_b_id,
        row,
        `先选后对方选 ${row.sample_size}`,
        row.sample_size
      );
      return;
    }

    if (row.evidence_type === "same_side_winrate_synergy" && rate <= 0.5) {
      const hero = ensureHero(row.hero_a_id);
      addMatchupEvidence(
        hero.synergies,
        row.hero_b_id,
        row,
        `同阵胜率 ${pct(rate)} · ${row.sample_size}`,
        (1 - rate) * 1000 + row.sample_size
      );
      return;
    }

    if (sameSidePickAfterASynergyEvidenceTypes.has(row.evidence_type)) {
      const hero = ensureHero(row.hero_a_id);
      addMatchupEvidence(
        hero.synergies,
        row.hero_b_id,
        row,
        `先选后己方选 ${row.sample_size}`,
        row.sample_size
      );
      return;
    }

    if (row.evidence_type === "enemy_ban_after_a_synergy") {
      const hero = ensureHero(row.hero_a_id);
      addMatchupEvidence(
        hero.synergies,
        row.hero_b_id,
        row,
        `先选后对方 Ban ${row.sample_size}`,
        row.sample_size
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

function buildHeroRelationDetailItems(
  heroId: number,
  rows: HeroPairRelation[],
  filters: AppFilters
): Record<HeroRelationGroupKey, HeroRelationDetailItem[]> {
  const grouped = new Map<string, HeroRelationDetailItem & { detailMap: Map<string, string> }>();
  rows
    .filter((row) => eventMatches(filters, row.event_group))
    .filter((row) => row.sample_size >= filters.minSample)
    .filter(isStrongRelationEvidence)
    .forEach((row) => {
      const classified = classifyRelation(row, heroId);
      if (!classified) {
        return;
      }
      const key = `${classified.groupKey}:${classified.otherHeroId}`;
      const current =
        grouped.get(key) ??
        ({
          otherHeroId: classified.otherHeroId,
          groupKey: classified.groupKey,
          totalSample: 0,
          strongestRate: 0,
          hasWinningEvidence: false,
          detailTexts: [],
          detailMap: new Map<string, string>()
        } satisfies HeroRelationDetailItem & { detailMap: Map<string, string> });
      current.totalSample += row.sample_size;
      current.strongestRate = Math.max(current.strongestRate, row.rate ?? 0);
      current.hasWinningEvidence = current.hasWinningEvidence || isWinningEvidence(row);

      const evidenceKey = row.evidence_type;
      const existing = current.detailMap.get(evidenceKey);
      const nextText = evidenceDetailText(row);
      current.detailMap.set(evidenceKey, existing ? `${existing} / ${nextText}` : nextText);
      grouped.set(key, current);
    });

  const result: Record<HeroRelationGroupKey, HeroRelationDetailItem[]> = {
    countered_by: [],
    counters: [],
    synergized_by: [],
    synergizes: []
  };
  grouped.forEach((item) => {
    result[item.groupKey].push({
      otherHeroId: item.otherHeroId,
      groupKey: item.groupKey,
      totalSample: item.totalSample,
      strongestRate: item.strongestRate,
      hasWinningEvidence: item.hasWinningEvidence,
      detailTexts: Array.from(item.detailMap.values())
    });
  });
  Object.values(result).forEach((items) =>
    items.sort(
      (a, b) =>
        Number(b.hasWinningEvidence) - Number(a.hasWinningEvidence) ||
        b.totalSample - a.totalSample ||
        b.strongestRate - a.strongestRate
    )
  );
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
  items,
  tools
}: {
  groupKey: HeroRelationGroupKey;
  items: HeroRelationDetailItem[];
  tools: ReturnType<typeof useHeroTools>;
}) {
  return (
    <section className="hero-relation-group">
      <h4>{relationGroupLabels[groupKey]}</h4>
      {items.length === 0 ? (
        <p className="empty-note">当前筛选下暂无明显强关系。</p>
      ) : (
        <div className="hero-relation-card-list">
          {items.slice(0, 8).map((item) => (
            <article className="hero-relation-card" key={`${groupKey}-${item.otherHeroId}`}>
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
    () => buildHeroRelationDetailItems(heroId, data.heroPairRelations, filters),
    [heroId, data.heroPairRelations, filters]
  );
  const recentHeatRows = useMemo(() => buildRecentHeatRows(heroId, data), [heroId, data]);
  const [activeDetailTab, setActiveDetailTab] = useState<HeroDetailTabKey>("counters");

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
        {activeDetailTab === "counters" && (
          <>
            <HeroRelationGroupSection groupKey="countered_by" items={groups.countered_by} tools={tools} />
            <HeroRelationGroupSection groupKey="counters" items={groups.counters} tools={tools} />
          </>
        )}
        {activeDetailTab === "synergies" && (
          <>
            <HeroRelationGroupSection groupKey="synergized_by" items={groups.synergized_by} tools={tools} />
            <HeroRelationGroupSection groupKey="synergizes" items={groups.synergizes} tools={tools} />
          </>
        )}
        {activeDetailTab === "heat" && <RecentHeatPanel rows={recentHeatRows} />}
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
    const targetEvent = eventOrder[eventOrder.length - 1]?.event_group;
    const previousEvent = eventOrder[eventOrder.length - 2]?.event_group ?? "";
    const selectedSet = new Set(eventOrder.map((event) => event.event_group));

    return data.heroEventMetrics
      .filter((metric) => metric.event_group === targetEvent)
      .filter((metric) => metricPassesFilters(metric, { ...filters, eventGroups: targetEvent ? [targetEvent] : [] }, tools))
      .map((metric) => {
        const samples = data.heroEventMetrics.filter(
          (row) => row.hero_id === metric.hero_id && selectedSet.has(row.event_group)
        );
        const baseline =
          filters.baseline === "sample_average"
            ? samples.reduce((sum, item) => sum + item.heat_rate, 0) / Math.max(samples.length, 1)
            : data.heroEventMetrics.find(
                (row) => row.hero_id === metric.hero_id && row.event_group === previousEvent
              )?.heat_rate ?? 0;
        return { ...metric, delta: metric.heat_rate - baseline, baseline_event: previousEvent || "样本外" };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [data, filters, tools]);

  const risingRows = rows.filter((row) => row.delta >= 0).slice(0, 12);
  const fallingRows = rows.filter((row) => row.delta < 0).slice(0, 12);

  return (
    <>
      <section className="dual-grid">
        <MovementList
          title={filters.baseline === "previous_event" ? "相邻赛事热度上升" : "热度上升"}
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
          title={filters.baseline === "previous_event" ? "相邻赛事热度下降" : "热度下降"}
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
        {rows.map((row) => {
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
  const minOverviewSample = Math.max(filters.minSample, 5);
  const rows = data.heroPairRelations
    .filter((row) => eventMatches(filters, row.event_group))
    .filter((row) => row.sample_size >= minOverviewSample)
    .filter((row) => !filters.heroSearch || tools.searchHit(row.hero_a_id, filters.heroSearch) || tools.searchHit(row.hero_b_id, filters.heroSearch))
    .sort((a, b) => b.sample_size - a.sample_size || (b.rate ?? 0) - (a.rate ?? 0));
  const heroRows = buildRelationOverviewRows(rows);

  return (
    <section className="relations-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <GitCompare aria-hidden="true" size={18} />
            <h2>英雄克制/配合 Top 3</h2>
          </div>
          <span>每个英雄 A 的被克制 / 配合目标</span>
        </div>
        {heroRows.length === 0 ? (
          <p className="empty-note">当前筛选下暂无可展示的克制/配合关系。</p>
        ) : (
          <div className="matchup-grid">
            {heroRows.map((hero) => (
              <article className="matchup-card" key={hero.heroId}>
                <div className="matchup-hero-title">
                  <HeroAvatar heroId={hero.heroId} tools={tools} />
                  <h3>{tools.label(hero.heroId)}</h3>
                </div>
                <div className="matchup-columns">
                  <MatchupTargetList title="被克制 Top 3" items={hero.counteredBy} tools={tools} />
                  <MatchupTargetList title="配合 Top 3" items={hero.synergies} tools={tools} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function MatchupTargetList({
  title,
  items,
  tools
}: {
  title: string;
  items: MatchupTarget[];
  tools: ReturnType<typeof useHeroTools>;
}) {
  return (
    <section className="matchup-section">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="empty-note">暂无命中口径</p>
      ) : (
        <ol className="matchup-target-list">
          {items.map((item) => (
            <li className="matchup-target" key={`${title}-${item.otherHeroId}`}>
              <div className="matchup-target-title">
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
  const bpRows = data.heroEventMetrics
    .filter((row) => metricPassesFilters(row, filters, tools))
    .sort((a, b) => b.first_phase_contest_rate - a.first_phase_contest_rate)
    .slice(0, 16);
  const laneRows = data.heroLaningRelations
    .filter((row) => eventMatches(filters, row.event_group))
    .filter((row) => row.sample_size >= filters.minSample)
    .filter((row) => !filters.heroSearch || tools.searchHit(row.hero_a_id, filters.heroSearch) || tools.searchHit(row.hero_b_id, filters.heroSearch))
    .sort((a, b) => b.sample_size - a.sample_size || b.lane_advantage_rate - a.lane_advantage_rate)
    .slice(0, 16);

  return (
    <section className="dual-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <Swords aria-hidden="true" size={18} />
            <h2>首轮 BP</h2>
          </div>
          <span>首 Ban + 首 Pick</span>
        </div>
        <div className="stack-list">
          {bpRows.map((row) => (
            <div className="rank-row" key={`${row.event_group}-${row.hero_id}-bp`}>
              <div>
                <strong>{tools.label(row.hero_id)}</strong>
                <span>{row.event_group}</span>
              </div>
              <div>{pct(row.first_phase_contest_rate)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <GitCompare aria-hidden="true" size={18} />
            <h2>对线期关系</h2>
          </div>
          <span>1+5 vs 3+4 / 2 vs 2</span>
        </div>
        <div className="stack-list">
          {laneRows.map((row: HeroLaningRelation) => (
            <div className="relation-row" key={`${row.event_group}-${row.hero_a_id}-${row.hero_b_id}-${row.evidence_type}`}>
              <div>
                <strong>{tools.label(row.hero_a_id)}</strong>
                <span>{row.lane_context === "mid" ? "中路" : relationLabel(row.relation_type)}</span>
                <strong>{tools.label(row.hero_b_id)}</strong>
              </div>
              <div>
                <b>{row.sample_size}</b>
                <span>
                  {pct(row.lane_advantage_rate)} / {row.avg_hit_diff_5m.toFixed(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
