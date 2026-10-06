import { describe, expect, it } from "vitest";
import { pixIdempotencyKey } from "./pix-idempotency";

describe("pixIdempotencyKey", () => {
  it("reuses the same provider idempotency key for the same charge on the same São Paulo day", () => {
    const beforeLocalMidnight = new Date("2026-10-07T02:30:00.000Z");
    const previousUtcDate = new Date("2026-10-06T23:00:00.000Z");

    expect(pixIdempotencyKey("charge-1", beforeLocalMidnight)).toBe(pixIdempotencyKey("charge-1", previousUtcDate));
  });

  it("uses a new key on the next São Paulo day and for a different charge", () => {
    const today = new Date("2026-10-06T15:00:00.000Z");
    const tomorrow = new Date("2026-10-07T15:00:00.000Z");
    const key = pixIdempotencyKey("charge-1", today);

    expect(pixIdempotencyKey("charge-1", tomorrow)).not.toBe(key);
    expect(pixIdempotencyKey("charge-2", today)).not.toBe(key);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
