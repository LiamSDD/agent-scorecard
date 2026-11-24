import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { RunStoreProvider, type StoredRun } from "@/components/run-store";

export const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
export const searchParams = { value: new URLSearchParams() };

export function renderWithStore(ui: ReactElement, initialRuns: StoredRun[] = []) {
  return render(<RunStoreProvider initialRuns={initialRuns}>{ui}</RunStoreProvider>);
}

export type FetchHandler = (url: string, init?: RequestInit) => Promise<Response> | Response;

export function stubFetch(post: FetchHandler, sharedKey = false) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!init || init.method === "GET") {
      return new Response(JSON.stringify({ sharedKey }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return post(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
