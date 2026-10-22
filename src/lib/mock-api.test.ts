import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "../../data/task1-service-explorer.json";
import { GET as getCategories } from "@/app/api/category/active/route";
import { GET as getProviders } from "@/app/api/providers/route";
import { GET as getServices } from "@/app/api/service/route";

vi.mock("server-only", () => ({}));

const endpoints = [
  { path: "/api/category/active", get: getCategories, data: fixture.categories },
  { path: "/api/providers", get: getProviders, data: fixture.providers },
  { path: "/api/service", get: getServices, data: fixture.services },
];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe.each(endpoints)("$path", ({ path, get, data }) => {
  it("returns the untouched collection after the default latency", async () => {
    let settled = false;
    const pending = get(new Request(`http://localhost${path}`)).then((response) => {
      settled = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(399);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(data);
  });

  it("can fail independently and recover on a subsequent request", async () => {
    const pending = endpoints.map((endpoint) =>
      endpoint.get(
        new Request(
          `http://localhost${endpoint.path}?delay=0${endpoint.path === path ? "&fail=true" : ""}`,
        ),
      ),
    );
    await vi.runAllTimersAsync();
    const responses = await Promise.all(pending);

    for (const [index, response] of responses.entries()) {
      if (endpoints[index].path === path) {
        expect(response.status).toBe(503);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(await response.json()).toMatchObject({
          error: { code: "MOCK_API_FAILURE" },
        });
      } else {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(endpoints[index].data);
      }
    }

    const retry = get(new Request(`http://localhost${path}?delay=0`));
    await vi.runAllTimersAsync();
    const recovered = await retry;
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual(data);
  });
});

it.each([
  { delay: 0, fail: false, status: 200 },
  { delay: 1250, fail: true, status: 503 },
  { delay: 5000, fail: false, status: 200 },
])("honors a $delay ms delay before returning $status", async ({ delay, fail, status }) => {
  let settled = false;
  const pending = getProviders(
    new Request(`http://localhost/api/providers?delay=${delay}&fail=${fail}`),
  ).then((response) => {
    settled = true;
    return response;
  });

  if (delay > 0) {
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
  } else {
    await vi.advanceTimersByTimeAsync(0);
  }

  expect((await pending).status).toBe(status);
});

it.each(["-1", "1.5", "abc", "5001", "Infinity", "", "1e3"])(
  "rejects the invalid delay %j with an actionable response",
  async (delay) => {
    const response = await getServices(
      new Request(`http://localhost/api/service?delay=${encodeURIComponent(delay)}`),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_DELAY",
        message: "delay must be a whole number between 0 and 5000 milliseconds.",
      },
    });
  },
);
