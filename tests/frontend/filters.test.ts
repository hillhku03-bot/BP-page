import { parseFilters, serializeFilters } from "../../src/data/filters";

test("filters round trip through query string", () => {
  const query = serializeFilters({
    eventGroups: ["DreamLeague Season 29", "BLAST SLAM VII"],
    position: "2",
    confidence: "confirmed",
    minSample: 5,
    heroSearch: "Puck"
  });
  expect(query).not.toContain("baseline=");
  expect(parseFilters(query)).toEqual({
    eventGroups: ["DreamLeague Season 29", "BLAST SLAM VII"],
    position: "2",
    confidence: "confirmed",
    minSample: 5,
    heroSearch: "Puck"
  });
});

test("filters parse legacy eventGroup as an eventGroups selection", () => {
  expect(parseFilters("eventGroup=BLAST+SLAM+VII")).toMatchObject({
    eventGroups: ["BLAST SLAM VII"]
  });
});

test("filters ignore removed baseline query values", () => {
  expect(parseFilters("eventGroups=DreamLeague+Season+29%2CBLAST+SLAM+VII&baseline=sample_average")).toMatchObject({
    eventGroups: ["DreamLeague Season 29", "BLAST SLAM VII"]
  });
});
