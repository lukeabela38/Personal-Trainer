import { Router } from "itty-router";
import { jsonResponse, errorResponse } from "../../shared/src/index";

const router = Router();

router.get("/health", () => jsonResponse({ status: "ok" }));

router.post("/webhook/hevy", async (request) => {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("json")) {
    return errorResponse("Expected application/json", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  return jsonResponse({ received: true, event: body }, 202);
});

router.all("*", () => errorResponse("Not found", 404));

export default {
  fetch: router.fetch,
};
