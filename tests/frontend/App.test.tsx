import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App";

const fixtures: Record<string, unknown> = {
  "/data/events.json": [{ event_group: "BLAST SLAM VII", match_count: 102, first_match: "2026-01-01", last_match: "2026-01-10" }],
  "/data/heroes.json": [
    { hero_id: 11, hero_name_en1: "Axe", hero_name_cn: "斧王" },
    { hero_id: 12, hero_name_en1: "Phantom Lancer", hero_name_cn: "幻影长矛手" }
  ],
  "/data/hero_event_metrics.json": [
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
      sample_size: 5,
      wins: 4,
      losses: 1,
      rate: 0.8,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "synergy",
      evidence_type: "same_side_winrate_synergy",
      sample_size: 6,
      wins: 5,
      losses: 1,
      rate: 0.833,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "counter",
      evidence_type: "enemy_pick_after_a_counter",
      sample_size: 6,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "counter",
      evidence_type: "own_ban_after_a_counter",
      sample_size: 6,
      rate: 1,
      confidence_flag: "ok"
    },
    {
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_a_id: 11,
      hero_b_id: 12,
      relation_type: "synergy",
      evidence_type: "enemy_ban_after_a_synergy",
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
  expect(screen.getByText(/斧王/)).toBeInTheDocument();
  expect(screen.getByText("29.4%")).toBeInTheDocument();
});

test("renders bp sequence evidence as its own relation section", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "克制配合" }));

  expect(screen.getByText("BP 时序证据")).toBeInTheDocument();
  expect(screen.getByText("先选后对方选")).toBeInTheDocument();
  expect(screen.getByText("先选后己方 Ban")).toBeInTheDocument();
  expect(screen.getByText("先选后对方 Ban")).toBeInTheDocument();
});

test("opens hero relation details from hero avatar", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "查看斧王关系详情" }));

  expect(screen.getByText("斧王关系详情")).toBeInTheDocument();
  expect(screen.getByText("克制该英雄")).toBeInTheDocument();
  expect(screen.getAllByText(/幻影长矛手/).length).toBeGreaterThan(0);
  expect(screen.getByText("对位 4胜1负")).toBeInTheDocument();
  expect(screen.getByText("先选后己方 Ban 6")).toBeInTheDocument();
  expect(screen.getByText("同阵 5胜1负")).toBeInTheDocument();
});
