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
      hero_a_id: 13,
      hero_b_id: 11,
      relation_type: "counter",
      evidence_type: "vs_winrate_counter",
      sample_size: 4,
      wins: 4,
      losses: 0,
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

test("defaults to adjacent-event heat movement as the main meta view", async () => {
  render(<App />);

  expect(await screen.findByRole("button", { name: "热度变化" })).toHaveClass("active");
  expect(screen.getByText("相邻赛事热度上升")).toBeInTheDocument();
  expect(screen.getAllByText(/DreamLeague Season 29 → BLAST SLAM VII/).length).toBeGreaterThan(0);
});

test("lets users compare any selected set of at least two events", async () => {
  render(<App />);

  expect(await screen.findByRole("checkbox", { name: "DreamLeague Season 29" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "BLAST SLAM VII" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" })).not.toBeChecked();

  fireEvent.click(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" }));
  expect(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" })).toBeChecked();

  fireEvent.click(screen.getByRole("checkbox", { name: "DreamLeague Season 29" }));
  expect(screen.getByRole("checkbox", { name: "DreamLeague Season 29" })).not.toBeChecked();
  expect(screen.getAllByText(/ESL One Birmingham 2026 → BLAST SLAM VII/).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" }));
  expect(screen.getByRole("checkbox", { name: "ESL One Birmingham 2026" })).toBeChecked();
});

test("renders official hero portrait from the npc hero key", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "英雄热度" }));
  const portraits = await screen.findAllByRole("img", { name: "斧王官方头像" });
  const portrait = portraits[0];

  expect(portrait).toHaveAttribute("src", expect.stringContaining("axe"));
  expect(portrait).toHaveAttribute("src", expect.stringContaining("cdn.cloudflare.steamstatic.com"));
});

test("groups counter and synergy evidence into top 3 targets for each hero", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "克制配合" }));

  expect(screen.getByText("英雄克制/配合 Top 3")).toBeInTheDocument();
  const axeCard = screen.getByText("斧王 / Axe").closest(".matchup-card");
  expect(axeCard).not.toBeNull();
  const axe = within(axeCard as HTMLElement);

  const counterSection = axe.getByText("被克制 Top 3").closest(".matchup-section");
  expect(counterSection).not.toBeNull();
  const counters = within(counterSection as HTMLElement);
  expect(counters.getByText(/幻影长矛手/)).toBeInTheDocument();
  expect(counters.getByText(/水晶室女/)).toBeInTheDocument();
  expect(counters.getByText(/主宰/)).toBeInTheDocument();
  expect(counters.queryByText(/影魔/)).not.toBeInTheDocument();
  expect(counters.getByText("对位A方胜率 33.3% · 9")).toBeInTheDocument();
  expect(counters.getByText("先选后己方 Ban 18")).toBeInTheDocument();
  expect(counters.getByText("先选后对方选 17")).toBeInTheDocument();

  const synergySection = axe.getByText("配合 Top 3").closest(".matchup-section");
  expect(synergySection).not.toBeNull();
  const synergies = within(synergySection as HTMLElement);
  expect(synergies.getByText(/帕克/)).toBeInTheDocument();
  expect(synergies.getByText(/水晶室女/)).toBeInTheDocument();
  expect(synergies.getByText(/主宰/)).toBeInTheDocument();
  expect(synergies.queryByText(/影魔/)).not.toBeInTheDocument();
  expect(synergies.getByText("同阵胜率 33.3% · 9")).toBeInTheDocument();
  expect(synergies.getByText("先选后己方选 15")).toBeInTheDocument();
  expect(synergies.getByText("先选后对方 Ban 14")).toBeInTheDocument();
});

test("opens hero relation details from hero avatar", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "英雄热度" }));
  const axeButtons = await screen.findAllByRole("button", { name: "查看斧王关系详情" });
  fireEvent.click(axeButtons[0]);

  expect(screen.getByText("斧王关系详情")).toBeInTheDocument();
  const selectedRow = axeButtons[0].closest("tr");
  expect(selectedRow?.nextElementSibling?.textContent).toContain("斧王关系详情");
  expect(screen.getByRole("tab", { name: "克制" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "配合" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "近3个月热度" })).toBeInTheDocument();
  expect(screen.getByText("克制该英雄")).toBeInTheDocument();
  expect(screen.getAllByText(/幻影长矛手/).length).toBeGreaterThan(0);
  expect(screen.getByText("对位 6胜3负")).toBeInTheDocument();
  expect(screen.getByText("先选后己方 Ban 11")).toBeInTheDocument();
  expect(screen.queryByText(/帕克/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "配合" }));
  expect(screen.getByText("同阵 5胜3负")).toBeInTheDocument();
  expect(screen.getByText("先选后对方 Ban 10")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "近3个月热度" }));
  expect(screen.getByText("最近 3 个月热度变化")).toBeInTheDocument();
  expect(screen.getByText(/DreamLeague Season 29 → BLAST SLAM VII/)).toBeInTheDocument();
});

test("opens movement hero details immediately below the clicked movement row", async () => {
  render(<App />);

  const axeButtons = await screen.findAllByRole("button", { name: "查看斧王关系详情" });
  fireEvent.click(axeButtons[0]);

  const selectedMovementRow = axeButtons[0].closest(".rank-row");
  expect(selectedMovementRow?.nextElementSibling?.textContent).toContain("斧王关系详情");
});
