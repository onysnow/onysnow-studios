import { describe, expect, it } from "vitest";
import { orderWithinSlots } from "./admin";

/**
 * The bug this guards.
 *
 * `saveOrder` used to assign `1..N` by array index, and the photo grid hands it
 * whatever the category filter left visible. So reordering inside a filter
 * renumbered that category on top of every other category's `1..N`, and since
 * the public gallery orders globally and paginates with `.range()`, duplicate
 * sort keys make that pagination unstable. Silent, and no undo.
 */
const photos = [
  { id: "cos-1", sort_order: 1 },
  { id: "eve-1", sort_order: 2 },
  { id: "cos-2", sort_order: 3 },
  { id: "eve-2", sort_order: 4 },
  { id: "cos-3", sort_order: 5 },
];

describe("orderWithinSlots", () => {
  it("leaves every row outside the dragged subset exactly where it was", () => {
    // Filtered to cosplay (slots 1, 3, 5) and dragged into reverse order.
    const pairs = orderWithinSlots(["cos-3", "cos-2", "cos-1"], photos);
    const touched = pairs.map((p) => p.id);

    expect(touched).not.toContain("eve-1");
    expect(touched).not.toContain("eve-2");
  });

  it("reuses the subset's own slots instead of renumbering from 1", () => {
    const pairs = orderWithinSlots(["cos-3", "cos-2", "cos-1"], photos);
    const byId = new Map(pairs.map((p) => [p.id, p.sortOrder]));

    // The three cosplay photographs still occupy 1, 3 and 5 — just differently.
    expect(byId.get("cos-3")).toBe(1);
    expect(byId.get("cos-1")).toBe(5);
    expect([...byId.values()].sort()).toEqual([1, 5]);
  });

  it("never produces a duplicate position across the whole table", () => {
    const pairs = orderWithinSlots(["cos-3", "cos-2", "cos-1"], photos);
    const moved = new Map(pairs.map((p) => [p.id, p.sortOrder]));
    const final = photos.map((p) => moved.get(p.id) ?? p.sort_order);

    expect(new Set(final).size).toBe(photos.length);
  });

  it("is an ordinary full reorder when nothing is filtered out", () => {
    const all = [
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
      { id: "c", sort_order: 3 },
    ];
    const pairs = orderWithinSlots(["c", "a", "b"], all);
    const byId = new Map(pairs.map((p) => [p.id, p.sortOrder]));

    expect(byId.get("c")).toBe(1);
    expect(byId.get("a")).toBe(2);
    expect(byId.get("b")).toBe(3);
  });

  it("writes nothing when the order is unchanged", () => {
    expect(orderWithinSlots(["cos-1", "cos-2", "cos-3"], photos)).toEqual([]);
  });

  it("places a row it has never seen after the end rather than displacing one", () => {
    // A photograph uploaded after the drag has no slot of its own yet.
    const pairs = orderWithinSlots(["cos-1", "cos-2", "cos-3", "new"], photos);
    const byId = new Map(pairs.map((p) => [p.id, p.sortOrder]));

    expect(byId.get("new")).toBe(6);
    expect(byId.has("cos-1")).toBe(false);
  });
});
