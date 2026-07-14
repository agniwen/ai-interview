import { http, HttpResponse } from "msw";
import type { HttpHandler } from "msw";
import { setupServer } from "msw/node";

export const defaultHandlers: HttpHandler[] = [
  http.get("*/api/stored/skills", () =>
    HttpResponse.json({ hasMore: false, page: 1, perPage: 50, skills: [], total: 0 }),
  ),
];

export const server = setupServer(...defaultHandlers);
