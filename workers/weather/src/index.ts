import { Router } from "itty-router";
import { jsonResponse, errorResponse } from "../../shared/src/index";

const router = Router();

router.get("/health", () => jsonResponse({ status: "ok" }));

router.get("/weather", async (request) => {
  const url = new URL(request.url);
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (!lat || !lon) {
    return errorResponse("lat and lon query params required", 400);
  }

  return jsonResponse({
    message: "Weather proxy placeholder — implement with #195",
    lat: parseFloat(lat),
    lon: parseFloat(lon),
  });
});

router.all("*", () => errorResponse("Not found", 404));

export default {
  fetch: router.fetch,
};
