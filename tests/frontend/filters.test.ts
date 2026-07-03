import { parseFilters, serializeFilters } from "../../src/data/filters";

test("filters round trip through query string", () => {
  const query = serializeFilters({
    eventGroup: "BLAST SLAM VII",
    position: "2",
    confidence: "confirmed",
    baseline: "previous_event",
    minSample: 5,
    heroSearch: "Puck"
  });
  expect(parseFilters(query)).toEqual({
    eventGroup: "BLAST SLAM VII",
    position: "2",
    confidence: "confirmed",
    baseline: "previous_event",
    minSample: 5,
    heroSearch: "Puck"
  });
});
