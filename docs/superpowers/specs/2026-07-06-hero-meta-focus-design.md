# Hero Meta Focus Design

## Goal

Upgrade the dashboard so hero identity is official-looking, the main meta signal is adjacent-event heat movement, and clicking a hero opens a focused detail area with relation and recent trend tabs.

## Requirements

- Hero rows and relation cards show official hero names and real hero portraits when `hero.hero_name` contains a `npc_dota_hero_*` key.
- The default dashboard tab is heat movement, because adjacent-event heat change is the most important meta signal.
- Adjacent-event movement is calculated by sorting events by `first_match` and comparing a hero's `heat_rate` in the target event to its previous event.
- Clicking any hero opens a detail panel. The panel has tabs for counters, synergies, and recent heat movement.
- Recent heat movement uses events from the last 3 months relative to the latest event in the local data. It does not invent missing matches or external data.

## Data Sources

- `public/data/heroes.json`: hero id, Chinese name, English name, and `npc_dota_hero_*` key.
- `public/data/events.json`: event name and date range.
- `public/data/hero_event_metrics.json`: hero heat, pick, ban, win rate, and first phase contest metrics by event.
- `public/data/hero_pair_relations.json`: counter and synergy evidence by event.

## UI Design

- Hero identity appears as a portrait plus Chinese official name, with English name as secondary text.
- The movement tab becomes the initial view and presents strongest upward and downward changes first.
- The hero detail panel reuses the existing click behavior but changes from four static relation groups to a tabbed detail surface:
  - Counters: heroes that counter this hero and heroes this hero counters.
  - Synergies: heroes that synergize with this hero in either direction.
  - Recent Heat: event-by-event heat in the last 3 months plus adjacent-event delta.

## Verification

- Frontend tests must prove the default tab is movement, hero portraits use official image URLs, and clicking a hero reveals the new tabs.
- TypeScript build, Vite build, frontend tests, and browser render checks must pass before completion.
