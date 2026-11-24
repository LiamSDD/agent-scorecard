import { describe, expect, it } from "vitest";
import { clientIp, SlidingWindowRateLimiter } from "@/lib/rate-limit";

describe("SlidingWindowRateLimiter", () => {
  it("allows up to the limit and then blocks with a retry-after", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(3, 60_000, () => now);
    expect([1, 2, 3].map(() => limiter.check("ip").allowed)).toEqual([true, true, true]);
    now = 10_000;
    expect(limiter.check("ip")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 50 });
  });

  it("frees capacity as old hits leave the window", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(2, 1000, () => now);
    limiter.check("ip");
    now = 500;
    limiter.check("ip");
    now = 1001;
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("tracks keys independently and caps memory", () => {
    const limiter = new SlidingWindowRateLimiter(1, 1000, () => 0, 2);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("c").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry, then x-real-ip", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
