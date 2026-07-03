import { useEffect, useMemo, useState } from "react";
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

const relationGroupLabels: Record<HeroRelationGroupKey, string> = {
  countered_by: "克制该英雄",
  counters: "该英雄克制",
  synergized_by: "配合该英雄",
  synergizes: "该英雄配合"
};

type HeroRelationGroupKey = "countered_by" | "counters" | "synergized_by" | "synergizes";

interface HeroRelationDetailItem {
  otherHeroId: number;
  groupKey: HeroRelationGroupKey;
  totalSample: number;
  detailTexts: string[];
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
  const en = hero.hero_name_en1 || hero.hero_name_en2;
  if (cn && en && cn !== en) {
    return `${cn} / ${en}`;
  }
  return cn || en || `Hero ${hero.hero_id}`;
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
  return filters.eventGroup === "all" || filters.eventGroup === eventGroup;
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

    return { label, primaryName, searchHit, positionSummary, positionByHeroEvent };
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
  const [activeTab, setActiveTab] = useState<TabKey>("heroes");
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

  const filteredMetrics = data.heroEventMetrics
    .filter((metric) => metricPassesFilters(metric, filters, tools))
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

        <FilterBar data={data} filters={filters} onChange={setFilters} />
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
            filters={filters}
            selectedHeroId={selectedHeroId}
            onSelectHero={setSelectedHeroId}
          />
        )}
        {activeTab === "movement" && <MovementPanel data={data} filters={filters} tools={tools} />}
        {activeTab === "relations" && <RelationsPanel data={data} filters={filters} tools={tools} />}
        {activeTab === "bp_laning" && <BpLaningPanel data={data} filters={filters} tools={tools} />}
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
  return (
    <section className="filter-bar" aria-label="filters">
      <label>
        <span>赛事</span>
        <select value={filters.eventGroup} onChange={(event) => update({ eventGroup: event.target.value })}>
          <option value="all">全样本</option>
          {data.events.map((event) => (
            <option key={event.event_group} value={event.event_group}>
              {event.event_group}
            </option>
          ))}
        </select>
      </label>

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
              {rows.map((row) => (
                <tr key={`${row.event_group}-${row.hero_id}`}>
                  <td className="hero-cell">
                    <HeroAvatarButton
                      heroId={row.hero_id}
                      tools={tools}
                      selected={selectedHeroId === row.hero_id}
                      onClick={() => onSelectHero(selectedHeroId === row.hero_id ? null : row.hero_id)}
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
            ))}
          </tbody>
        </table>
      </div>
      {selectedHeroId !== null && (
        <HeroRelationDetailPanel
          heroId={selectedHeroId}
          data={data}
          filters={filters}
          tools={tools}
          onClose={() => onSelectHero(null)}
        />
      )}
      <footer className="panel-foot">{numberFormat.format(data.heroEventMetrics.length)} 条英雄-赛事指标</footer>
    </section>
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
      <span className="hero-avatar" aria-hidden="true">
        {name.slice(0, 1)}
      </span>
      <span>{tools.label(heroId)}</span>
    </button>
  );
}

function classifyRelation(row: HeroPairRelation, heroId: number): { groupKey: HeroRelationGroupKey; otherHeroId: number } | null {
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

function buildHeroRelationDetailItems(
  heroId: number,
  rows: HeroPairRelation[],
  filters: AppFilters
): Record<HeroRelationGroupKey, HeroRelationDetailItem[]> {
  const grouped = new Map<string, HeroRelationDetailItem & { detailMap: Map<string, string> }>();
  rows
    .filter((row) => eventMatches(filters, row.event_group))
    .filter((row) => row.sample_size >= filters.minSample)
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
          detailTexts: [],
          detailMap: new Map<string, string>()
        } satisfies HeroRelationDetailItem & { detailMap: Map<string, string> });
      current.totalSample += row.sample_size;

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
      detailTexts: Array.from(item.detailMap.values())
    });
  });
  Object.values(result).forEach((items) => items.sort((a, b) => b.totalSample - a.totalSample));
  return result;
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
  const groupKeys: HeroRelationGroupKey[] = ["countered_by", "counters", "synergized_by", "synergizes"];

  return (
    <section className="hero-detail-panel" aria-label={`${tools.primaryName(heroId)}关系详情`}>
      <div className="hero-detail-header">
        <div className="hero-detail-title">
          <span className="hero-avatar large" aria-hidden="true">
            {tools.primaryName(heroId).slice(0, 1)}
          </span>
          <div>
            <h3>{tools.primaryName(heroId)}关系详情</h3>
            <p>{tools.label(heroId)}</p>
          </div>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="关闭英雄关系详情">
          ×
        </button>
      </div>

      <div className="hero-detail-groups">
        {groupKeys.map((groupKey) => (
          <section className="hero-relation-group" key={groupKey}>
            <h4>{relationGroupLabels[groupKey]}</h4>
            {groups[groupKey].length === 0 ? (
              <p className="empty-note">当前筛选下无满足样本量的证据。</p>
            ) : (
              <div className="hero-relation-card-list">
                {groups[groupKey].slice(0, 8).map((item) => (
                  <article className="hero-relation-card" key={`${groupKey}-${item.otherHeroId}`}>
                    <div className="hero-relation-card-title">
                      <span className="hero-avatar" aria-hidden="true">
                        {tools.primaryName(item.otherHeroId).slice(0, 1)}
                      </span>
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
  tools
}: {
  data: AppData;
  filters: AppFilters;
  tools: ReturnType<typeof useHeroTools>;
}) {
  const rows = useMemo(() => {
    const eventOrder = [...data.events].sort((a, b) => a.first_match.localeCompare(b.first_match));
    const targetEvent =
      filters.eventGroup === "all" ? eventOrder[eventOrder.length - 1]?.event_group : filters.eventGroup;
    const targetIndex = eventOrder.findIndex((event) => event.event_group === targetEvent);
    const previousEvent = targetIndex > 0 ? eventOrder[targetIndex - 1].event_group : "";

    return data.heroEventMetrics
      .filter((metric) => metric.event_group === targetEvent)
      .filter((metric) => metricPassesFilters(metric, { ...filters, eventGroup: targetEvent }, tools))
      .map((metric) => {
        const samples = data.heroEventMetrics.filter((row) => row.hero_id === metric.hero_id);
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

  return (
    <section className="dual-grid">
      <MovementList title="热度上升" icon={ArrowUpRight} rows={rows.filter((row) => row.delta >= 0).slice(0, 12)} tools={tools} />
      <MovementList title="热度下降" icon={ArrowDownRight} rows={rows.filter((row) => row.delta < 0).slice(0, 12)} tools={tools} />
    </section>
  );
}

function MovementList({
  title,
  icon: Icon,
  rows,
  tools
}: {
  title: string;
  icon: typeof ArrowUpRight;
  rows: Array<HeroEventMetric & { delta: number; baseline_event: string }>;
  tools: ReturnType<typeof useHeroTools>;
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
        {rows.map((row) => (
          <div className="rank-row" key={`${row.event_group}-${row.hero_id}-${title}`}>
            <div>
              <strong>{tools.label(row.hero_id)}</strong>
              <span>{row.event_group}</span>
            </div>
            <div className={row.delta >= 0 ? "delta up" : "delta down"}>
              {pct(row.heat_rate)} · {signedPct(row.delta)}
            </div>
          </div>
        ))}
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
    .filter((row) => row.sample_size >= filters.minSample)
    .filter((row) => !filters.heroSearch || tools.searchHit(row.hero_a_id, filters.heroSearch) || tools.searchHit(row.hero_b_id, filters.heroSearch))
    .sort((a, b) => b.sample_size - a.sample_size || (b.rate ?? 0) - (a.rate ?? 0));
  const sequenceRows = rows.filter((row) => bpSequenceEvidenceTypes.has(row.evidence_type));
  const winrateRows = rows.filter((row) => !bpSequenceEvidenceTypes.has(row.evidence_type));

  return (
    <section className="relations-layout">
      <BpSequenceEvidencePanel rows={sequenceRows.slice(0, 24)} tools={tools} />
      <section className="dual-grid">
        <RelationList
          title="胜率克制证据"
          rows={winrateRows.filter((row) => row.relation_type === "counter").slice(0, 18)}
          tools={tools}
        />
        <RelationList
          title="胜率配合证据"
          rows={winrateRows.filter((row) => row.relation_type === "synergy").slice(0, 18)}
          tools={tools}
        />
      </section>
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
