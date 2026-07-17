import { SELF } from "cloudflare:test";

describe("webhook worker", () => {
  it("returns ok on health check", async () => {
    const response = await SELF.fetch("http://localhost/health");
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  it("returns 404 for unknown route", async () => {
    const response = await SELF.fetch("http://localhost/unknown");
    expect(response.status).toBe(404);
  });

  it("returns 415 for non-JSON POST", async () => {
    const response = await SELF.fetch(
      new Request("http://localhost/webhook/hevy", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(response.status).toBe(415);
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await SELF.fetch(
      new Request("http://localhost/webhook/hevy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 202 for valid webhook", async () => {
    const response = await SELF.fetch(
      new Request("http://localhost/webhook/hevy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "workout.completed", data: {} }),
      }),
    );
    expect(response.status).toBe(202);
    const body = await response.json() as { received: boolean };
    expect(body.received).toBe(true);
  });
});
