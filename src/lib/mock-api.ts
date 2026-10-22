import "server-only";

import fixture from "../../data/task1-service-explorer.json";
import type { RawCatalog } from "./catalog/types";

const data: RawCatalog = fixture;
type Collection = keyof RawCatalog;

const DEFAULT_DELAY_MS = 400;
const MAX_DELAY_MS = 5_000;
const headers = { "Cache-Control": "no-store" };

export async function getMockCollection(
  request: Request,
  collection: Collection,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const delayParam = params.get("delay");
  const delay = delayParam === null ? DEFAULT_DELAY_MS : Number(delayParam);

  if (
    delayParam !== null &&
    (!/^\d+$/.test(delayParam) ||
      !Number.isSafeInteger(delay) ||
      delay > MAX_DELAY_MS)
  ) {
    return Response.json(
      {
        error: {
          code: "INVALID_DELAY",
          message: `delay must be a whole number between 0 and ${MAX_DELAY_MS} milliseconds.`,
        },
      },
      { status: 400, headers },
    );
  }

  await new Promise((resolve) => setTimeout(resolve, delay));

  if (params.get("fail") === "true") {
    return Response.json(
      {
        error: {
          code: "MOCK_API_FAILURE",
          message: `The ${collection} request failed. Retry without fail=true.`,
        },
      },
      { status: 503, headers },
    );
  }

  return Response.json(data[collection], { headers });
}
