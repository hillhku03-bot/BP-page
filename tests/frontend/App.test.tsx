import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App";

const fixtures: Record<string, unknown> = {
  "/data/events.json": [
    { event_group: "ESL One Birmingham 2026", match_count: 78, first_match: "2026-03-24", last_match: "2026-03-30" },
    { event_group: "DreamLeague Season 29", match_count: 185, first_match: "2026-05-13", last_match: "2026-05-25" },
    { event_group: "BLAST SLAM VII", match_count: 102, first_match: "2026-06-01", last_match: "2026-06-10" }
  ],
  "/data/heroes.json": [
    { hero_id: 11, hero_name_en1: "Axe", hero_name_en2: "Axe", hero_name: "npc_dota_hero_axe", hero_name_cn: "斧王" },
    {
      hero_id: 12,
      hero_name_en1: "PhantomLancer",
      hero_name_en2: "Phantom Lancer",
      hero_name: "npc_dota_hero_phantom_lancer",
      hero_name_cn: "幻影长矛手"
    },
    {
      hero_id: 13,
      hero_name_en1: "Puck",
      hero_name_en2: "Puck",
      hero_name: "npc_dota_hero_puck",
      hero_name_cn: "帕克"
    },
    {
      hero_id: 14,
      hero_name_en1: "CrystalMaiden",
      hero_name_en2: "Crystal Maiden",
      hero_name: "npc_dota_hero_crystal_maiden",
      hero_name_cn: "水晶室女"
    },
    {
      hero_id: 15,
      hero_name_en1: "Juggernaut",
      hero_name_en2: "Juggernaut",
      hero_name: "npc_dota_hero_juggernaut",
      hero_name_cn: "主宰"
    },
    {
      hero_id: 16,
      hero_name_en1: "ShadowFiend",
      hero_name_en2: "Shadow Fiend",
      hero_name: "npc_dota_hero_nevermore",
      hero_name_cn: "影魔"
    }
  ],
  "/data/hero_event_metrics.json": [
    {
      patch_version: "7.41",
      event_group: "ESL One Birmingham 2026",
      hero_id: 11,
      match_count: 78,
      pick_count: 5,
      ban_count: 8,
      first_ban: 2,
      first_pick: 1,
      heat_rate: 0.167,
      pick_rate: 0.064,
      ban_rate: 0.103,
      win_rate: 0.4,
      first_phase_contest_rate: 0.038
    },
    {
      patch_version: "7.41",
      event_group: "DreamLeague Season 29",
      hero_id: 11,
      match_count: 185,
      pick_count: 20,
      ban_count: 30,
      first_ban: 10,
      first_pick: 4,
      heat_rate: 0.27,
      pick_rate: 0.108,
      ban_rate: 0.162,
      win_rate: 0.55,
      first_phase_contest_rate: 0.076
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_id: 11,
      match_count: 102,
      pick_count: 10,
      ban_count: 20,
      first_ban: 6,
      first_pick: 4,
      heat_rate: 0.294,
      pick_rate: 0.098,
      ban_rate: 0.196,
      win_rate: 0.6,
      first_phase_contest_rate: 0.098
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_id: 12,
      match_count: 102,
      pick_count: 6,
      ban_count: 8,
      first_ban: 3,
      first_pick: 2,
      heat_rate: 0.137,
      pick_rate: 0.059,
      ban_rate: 0.078,
      win_rate: 0.5,
      first_phase_contest_rate: 0.049
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_id: 13,
      match_count: 102,
      pick_count: 4,
      ban_count: 80,
      first_ban: 30,
      first_pick: 1,
      heat_rate: 0.824,
      pick_rate: 0.039,
      ban_rate: 0.784,
      win_rate: 0.5,
      first_phase_contest_rate: 0.304
    },
    {
      patch_version: "7.41",
      event_group: "DreamLeague Season 29",
      hero_id: 13,
      match_count: 185,
      pick_count: 5,
      ban_count: 100,
      first_ban: 50,
      first_pick: 1,
      heat_rate: 0.568,
      pick_rate: 0.027,
      ban_rate: 0.541,
      win_rate: 0.5,
      first_phase_contest_rate: 0.276
    }
  ],
  "/data/hero_position_metrics.json": [
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_id: 11,
      position: 3,
      position_pick_count: 8,
      match_count: 102,
      position_pick_rate: 0.078,
      confidence_flag: "confirmed"
    }
  ],
  "/data/hero_pair_relations.json": [
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 12,
      hero_b_id: 11,
      relation_type: "counter",
      evidence_type: "vs_winrate_counter",
      sample_size: 9,
      wins: 6,
      losses: 3,
      rate: 0.667,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "DreamLeague Season 29",
      hero_a_id: 12,
      hero_b_id: 11,
      relation_type: "counter",
      evidence_type: "vs_winrate_counter",
      sample_size: 7,
      wins: 5,
      losses: 2,
      rate: 0.714,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "synergy",
      evidence_type: "same_side_winrate_synergy",
      sample_size: 8,
      wins: 5,
      losses: 3,
      rate: 0.625,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "DreamLeague Season 29",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "synergy",
      evidence_type: "same_side_winrate_synergy",
      sample_size: 7,
      wins: 5,
      losses: 2,
      rate: 0.714,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "counter",
      evidence_type: "enemy_pick_after_a_counter",
      sample_size: 12,
      rate: 0.75,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "counter",
      evidence_type: "own_ban_after_a_counter",
      sample_size: 11,
      rate: 0.73,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "synergy",
      evidence_type: "enemy_ban_after_a_synergy",
      sample_size: 10,
      rate: 0.7,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 14,
      relation_type: "counter",
      evidence_type: "own_ban_after_a_counter",
      sample_size: 18,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 15,
      relation_type: "counter",
      evidence_type: "enemy_pick_after_a_counter",
      sample_size: 17,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 16,
      relation_type: "counter",
      evidence_type: "enemy_pick_after_a_counter",
      sample_size: 16,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 13,
      relation_type: "synergy",
      evidence_type: "same_side_winrate_synergy",
      sample_size: 9,
      wins: 3,
      losses: 6,
      rate: 0.333,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 14,
      relation_type: "synergy",
      evidence_type: "same_side_pick_after_a_synergy",
      sample_size: 15,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 15,
      relation_type: "synergy",
      evidence_type: "enemy_ban_after_a_synergy",
      sample_size: 14,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 16,
      relation_type: "synergy",
      evidence_type: "enemy_ban_after_a_synergy",
      sample_size: 13,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 13,
      relation_type: "synergy",
      evidence_type: "enemy_ban_after_a_synergy",
      sample_size: 6,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 13,
      hero_b_id: 11,
      relation_type: "counter",
      evidence_type: "vs_winrate_counter",
      sample_size: 10,
      wins: 6,
      losses: 4,
      rate: 0.6,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 13,
      relation_type: "counter",
      evidence_type: "vs_winrate_counter",
      sample_size: 10,
      wins: 6,
      losses: 4,
      rate: 0.6,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 15,
      hero_b_id: 11,
      relation_type: "counter",
      evidence_type: "enemy_pick_after_a_counter",
      sample_size: 5,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 16,
      hero_b_id: 11,
      relation_type: "counter",
      evidence_type: "own_ban_after_a_counter",
      sample_size: 6,
      rate: 1,
      confidence_flag: "ok"
    }
  ],
  "/data/hero_laning_relations.json": [],
  "/data/data_quality.json": {
    patch_version: "7.41",
    calculation_version: "test",
    totals: {
      matches: 102,
      bp_matches: 102,
      player_matches: 102,
      confirmed_position_matches: 102,
      raw_position_matches: 102,
      issue_count: 0
    },
    event_match_counts: { "BLAST SLAM VII": 102 },
    event_quality: [],
    issue_summary: {},
    issues: []
  }
};

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fixtures[path])
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders loaded dashboard data", async () => {
  render(<App />);

  expect(await screen.findByText("102 场")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "英雄热度" }));
  expect(screen.getAllByText(/斧王/).length).toBeGreaterThan(0);
  expect(screen.getByText("29.4%")).toBeInTheDocument();
});

test("defaults to earliest-to-latest heat movement as the main meta view", async () => {
  render(<App />);

  expect(await screen.findByRole("button", { name: "热度变化" })).toHaveClass("active");
  expect(screen.getByText("最早至最晚热度上升")).toBeInTheDocument();
  expect(screen.getAllByText(/DreamLeague Season 29 → BLAST SLAM VII/).length).toBeGreaterThan(0);
  expect(screen.queryByText("斧王 / Axe")).not.toBeInTheDocument();
  expect(screen.queryByText("变化基线")).not.toBeInTheDocument();
});

test("lets users compare any selected set of at least two events", async () => {
  render(<App />);

  expect(await screen.findByRole("checkbox", { name: "DreamLeague Season 29" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "BLAST SLAM VII" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" })).not.toBeChecked();
  expect(screen.getAllByText(/DreamLeague Season 29 → BLAST SLAM VII/).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" }));
  expect(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" })).toBeChecked();

  fireEvent.click(screen.getByRole("checkbox", { name: "DreamLeague Season 29" }));
  expect(screen.getByRole("checkbox", { name: "DreamLeague Season 29" })).not.toBeChecked();
  expect(screen.getAllByText(/DreamLeague Season 29 → BLAST SLAM VII/).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  expect(screen.getAllByText(/ESL One Birmingham 2026 → BLAST SLAM VII/).length).toBeGreaterThan(0);
  expect(window.location.search).not.toContain("baseline=");

  fireEvent.click(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" }));
  expect(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" })).toBeChecked();
});

test("shows independent hero heat rankings for each selected event", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "英雄热度" }));

  const dreamLeagueColumn = screen.getByRole("heading", { name: "DreamLeague Season 29" }).closest(".event-ranking-column");
  expect(dreamLeagueColumn).not.toBeNull();
  const dreamLeague = within(dreamLeagueColumn as HTMLElement);
  expect(dreamLeague.getByText("帕克 / Puck")).toBeInTheDocument();
  expect(dreamLeague.getByText("56.8%")).toBeInTheDocument();
  expect(dreamLeague.getByText("斧王 / Axe")).toBeInTheDocument();
  expect(dreamLeague.getByText("27.0%")).toBeInTheDocument();

  const blastColumn = screen.getByRole("heading", { name: "BLAST SLAM VII" }).closest(".event-ranking-column");
  expect(blastColumn).not.toBeNull();
  const blast = within(blastColumn as HTMLElement);
  expect(blast.getByText("帕克 / Puck")).toBeInTheDocument();
  expect(blast.getByText("82.4%")).toBeInTheDocument();
  expect(blast.getByText("斧王 / Axe")).toBeInTheDocument();
  expect(blast.getByText("29.4%")).toBeInTheDocument();
  expect(blast.getByText("幻影长矛手 / Phantom Lancer")).toBeInTheDocument();
});

test("uses confirmed roster positions when a position filter is applied", async () => {
  render(<App />);

  await screen.findByRole("button", { name: "热度变化" });
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  fireEvent.click(screen.getByRole("button", { name: "英雄热度" }));

  const blastColumn = screen.getByRole("heading", { name: "BLAST SLAM VII" }).closest(".event-ranking-column");
  expect(blastColumn).not.toBeNull();
  const blast = within(blastColumn as HTMLElement);
  expect(blast.getByText("斧王 / Axe")).toBeInTheDocument();
  expect(blast.getByText("3号位 确认")).toBeInTheDocument();
  expect(blast.queryByText("帕克 / Puck")).not.toBeInTheDocument();
});

test("renders official hero portrait from the npc hero key", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "英雄热度" }));
  const portraits = await screen.findAllByRole("img", { name: "斧王官方头像" });
  const portrait = portraits[0];

  expect(portrait).toHaveAttribute("src", expect.stringContaining("axe"));
  expect(portrait).toHaveAttribute("src", expect.stringContaining("cdn.cloudflare.steamstatic.com"));
});

test("groups the strongest global counter and synergy pairs", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "克制配合" }));

  expect(screen.getByText("显著克制 Top 30")).toBeInTheDocument();
  const counterSection = screen.getByText("显著克制 Top 30").closest(".panel");
  expect(counterSection).not.toBeNull();
  const counters = within(counterSection as HTMLElement);
  expect(counters.getAllByText(/水晶室女/).length).toBeGreaterThan(0);
  expect(counters.getAllByText(/主宰/).length).toBeGreaterThan(0);
  expect(counters.getAllByText(/影魔/).length).toBeGreaterThan(0);
  expect(counters.getByText("选出斧王后己方ban掉水晶室女18次，高出本赛事均值+60.0pp")).toBeInTheDocument();
  expect(counters.getByText("选出斧王后对方选出主宰17次，高出本赛事均值+56.7pp")).toBeInTheDocument();

  expect(screen.getByText("显著配合 Top 30")).toBeInTheDocument();
  const synergySection = screen.getByText("显著配合 Top 30").closest(".panel");
  expect(synergySection).not.toBeNull();
  const synergies = within(synergySection as HTMLElement);
  expect(synergies.getAllByText(/水晶室女/).length).toBeGreaterThan(0);
  expect(synergies.getAllByText(/主宰/).length).toBeGreaterThan(0);
  expect(synergies.getAllByText(/影魔/).length).toBeGreaterThan(0);
  expect(synergies.getByText("选出斧王后己方选出水晶室女15次，高出本赛事均值+50.0pp")).toBeInTheDocument();
  expect(synergies.getByText("选出斧王后对方ban掉主宰14次，高出本赛事均值+46.7pp")).toBeInTheDocument();
});

test("opens hero relation details from hero avatar", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "英雄热度" }));
  const axeButtons = await screen.findAllByRole("button", { name: "查看斧王关系详情" });
  fireEvent.click(axeButtons[0]);

  expect(screen.getByText("斧王关系详情")).toBeInTheDocument();
  const selectedRow = axeButtons[0].closest(".event-hero-row");
  expect(selectedRow?.nextElementSibling?.textContent).toContain("斧王关系详情");
  const detail = within(selectedRow?.nextElementSibling as HTMLElement);
  expect(detail.getByRole("tab", { name: "被克制" })).toBeInTheDocument();
  expect(detail.getByRole("tab", { name: "克制" })).toBeInTheDocument();
  expect(detail.getByRole("tab", { name: "配合" })).toBeInTheDocument();
  expect(detail.getByRole("tab", { name: "不配合" })).toBeInTheDocument();
  expect(detail.queryByRole("tab", { name: "近3个月热度" })).not.toBeInTheDocument();
  expect(detail.getAllByText("被克制").length).toBeGreaterThanOrEqual(2);

  const banAfterASection = detail.getByText("选A后己方 Ban B").closest(".hero-relation-section");
  expect(banAfterASection).not.toBeNull();
  const banAfterA = within(banAfterASection as HTMLElement);
  expect(banAfterA.getByText("水晶室女 / Crystal Maiden")).toBeInTheDocument();
  expect(banAfterA.getByText("幻影长矛手 / Phantom Lancer")).toBeInTheDocument();
  expect(banAfterA.getByText("选出斧王后己方ban掉水晶室女18次")).toBeInTheDocument();
  expect(banAfterA.getByText("选出斧王后己方ban掉幻影长矛手11次")).toBeInTheDocument();

  const enemyPickAfterASection = detail.getByText("选A后对方选 B").closest(".hero-relation-section");
  expect(enemyPickAfterASection).not.toBeNull();
  const enemyPickAfterA = within(enemyPickAfterASection as HTMLElement);
  expect(enemyPickAfterA.getByText("主宰 / Juggernaut")).toBeInTheDocument();
  expect(enemyPickAfterA.getByText("影魔 / Shadow Fiend")).toBeInTheDocument();
  expect(enemyPickAfterA.getByText("幻影长矛手 / Phantom Lancer")).toBeInTheDocument();
  expect(enemyPickAfterA.getByText("选出斧王后对方选出主宰17次")).toBeInTheDocument();
  expect(enemyPickAfterA.getAllByRole("article")).toHaveLength(3);

  const lowWinrateSection = detail.getByText("己方A对方B胜率低").closest(".hero-relation-section");
  expect(lowWinrateSection).not.toBeNull();
  const lowWinrate = within(lowWinrateSection as HTMLElement);
  expect(lowWinrate.getByText("幻影长矛手 / Phantom Lancer")).toBeInTheDocument();
  expect(lowWinrate.getByText("帕克 / Puck")).toBeInTheDocument();
  expect(lowWinrate.getByText("斧王对阵幻影长矛手时己方5胜11负")).toBeInTheDocument();
  expect(lowWinrate.getByText("斧王对阵帕克时己方4胜6负")).toBeInTheDocument();
  expect(detail.queryByText(/33.9pp/)).not.toBeInTheDocument();

  fireEvent.click(detail.getByRole("tab", { name: "克制" }));
  const allyPickAfterEnemySection = detail.getByText("对方B后己方选 A").closest(".hero-relation-section");
  expect(allyPickAfterEnemySection).not.toBeNull();
  expect(within(allyPickAfterEnemySection as HTMLElement).getByText("对方选出主宰后己方选出斧王5次")).toBeInTheDocument();
  const banAAfterEnemySection = detail.getByText("对方选B后 Ban A").closest(".hero-relation-section");
  expect(banAAfterEnemySection).not.toBeNull();
  expect(within(banAAfterEnemySection as HTMLElement).getByText("对方选出影魔后己方ban掉斧王6次")).toBeInTheDocument();
  const highWinrateSection = detail.getByText("己方A对方B胜率高").closest(".hero-relation-section");
  expect(highWinrateSection).not.toBeNull();
  expect(within(highWinrateSection as HTMLElement).getByText("斧王对阵帕克时己方6胜4负")).toBeInTheDocument();

  fireEvent.click(detail.getByRole("tab", { name: "配合" }));
  const sameSideSection = detail.getByText("己方选AB胜率高").closest(".hero-relation-section");
  expect(sameSideSection).not.toBeNull();
  expect(within(sameSideSection as HTMLElement).getByText("选出斧王和幻影长矛手后己方10胜5负")).toBeInTheDocument();
  const enemyBanAfterASection = detail.getByText("己方选A后对方 Ban B").closest(".hero-relation-section");
  expect(enemyBanAfterASection).not.toBeNull();
  const enemyBanAfterA = within(enemyBanAfterASection as HTMLElement);
  expect(enemyBanAfterA.getByText("主宰 / Juggernaut")).toBeInTheDocument();
  expect(enemyBanAfterA.getByText("影魔 / Shadow Fiend")).toBeInTheDocument();
  expect(enemyBanAfterA.getByText("幻影长矛手 / Phantom Lancer")).toBeInTheDocument();
  expect(enemyBanAfterA.getByText("选出斧王后对方ban掉主宰14次")).toBeInTheDocument();
  expect(enemyBanAfterA.getAllByRole("article")).toHaveLength(3);
  const allyBanAfterEnemyASection = detail.getByText("对方选A后己方 Ban B").closest(".hero-relation-section");
  expect(allyBanAfterEnemyASection).not.toBeNull();
  expect(within(allyBanAfterEnemyASection as HTMLElement).getByText("对方选出斧王后己方ban掉幻影长矛手10次")).toBeInTheDocument();
  expect(detail.queryByText("先选后己方选 15")).not.toBeInTheDocument();
  expect(enemyBanAfterA.queryByText(/帕克/)).not.toBeInTheDocument();

  fireEvent.click(detail.getByRole("tab", { name: "不配合" }));
  const antiSynergySection = detail.getByText("选出A和B后胜率低").closest(".hero-relation-section");
  expect(antiSynergySection).not.toBeNull();
  const antiSynergies = within(antiSynergySection as HTMLElement);
  expect(antiSynergies.getByText("帕克 / Puck")).toBeInTheDocument();
  expect(antiSynergies.getByText("选出斧王和帕克后己方3胜6负")).toBeInTheDocument();
});

test("opens movement hero details immediately below the clicked movement row", async () => {
  render(<App />);

  const puckButtons = await screen.findAllByRole("button", { name: "查看帕克关系详情" });
  fireEvent.click(puckButtons[0]);

  const selectedMovementRow = puckButtons[0].closest(".rank-row");
  expect(selectedMovementRow?.nextElementSibling?.textContent).toContain("帕克关系详情");
});

test("shows first-phase ban and pick heat movement without lane relations", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "首轮 BP" }));

  expect(screen.getByText("首轮被 Ban 英雄")).toBeInTheDocument();
  const firstBanPanel = screen.getByText("首轮被 Ban 英雄").closest(".panel");
  expect(firstBanPanel).not.toBeNull();
  const firstBans = within(firstBanPanel as HTMLElement);
  expect(firstBans.getByText("帕克 / Puck")).toBeInTheDocument();
  expect(firstBans.getByText("首轮 Ban 30")).toBeInTheDocument();
  expect(firstBans.getByText("82.4% · +25.6pp")).toBeInTheDocument();

  expect(screen.getByText("首轮被选英雄")).toBeInTheDocument();
  const firstPickPanel = screen.getByText("首轮被选英雄").closest(".panel");
  expect(firstPickPanel).not.toBeNull();
  const firstPicks = within(firstPickPanel as HTMLElement);
  expect(firstPicks.getByText("斧王 / Axe")).toBeInTheDocument();
  expect(firstPicks.getByText("首轮 Pick 4")).toBeInTheDocument();
  expect(firstPicks.getByText("首轮选择胜率 60.0%")).toBeInTheDocument();
  expect(screen.queryByText("对线期关系")).not.toBeInTheDocument();
});
