import { getMockCollection } from "@/lib/mock-api";

export function GET(request: Request) {
  return getMockCollection(request, "providers");
}
