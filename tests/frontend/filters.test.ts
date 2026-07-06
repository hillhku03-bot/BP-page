import { parseFilters, serializeFilters } from "../../src/data/filters";

test("filters round trip through query string", () => {
  const query = serializeFilters({
    eventGroups: ["DreamLeague Season 29", "BLAST SLAM VII"],
    position: "2",
    confidence: "confirmed",
    baseline: "previous_event",
    minSample: 5,
    heroSearch: "Puck"
  });
  expect(parseFilters(query)).toEqual({
    eventGroups: ["DreamLeague Season 29", "BLAST SLAM VII"],
    position: "2",
    confidence: "confirmed",
    baseline: "previous_event",
    minSample: 5,
    heroSearch: "Puck"
  });
});

test("filters parse legacy eventGroup as an eventGroups selection", () => {
  expect(parseFilters("eventGroup=BLAST+SLAM+VII")).toMatchObject({
    eventGroups: ["BLAST SLAM VII"]
  });
});
