import { isHeroEventMetric } from "../../src/data/contracts";

test("hero event metric contract accepts required fields", () => {
  expect(
    isHeroEventMetric({
      patch_version: "7.41",
      event_group: "BLAST SLAM VII",
      hero_id: 11,
      match_count: 102,
      pick_count: 10,
      ban_count: 20,
      heat_rate: 0.294,
      pick_rate: 0.098,
      ban_rate: 0.196,
      first_phase_contest_rate: 0.1,
      confidence_flag: "ok"
    })
  ).toBe(true);
});
