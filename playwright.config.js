import { chromium, defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const useExternalServer = process.env.PLAYWRIGHT_USE_EXTERNAL_SERVER === "1";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? chromium.executablePath();

export default defineConfig({
  testDir: "./tests/browser",
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: {
      executablePath: chromiumExecutablePath,
    },
  },
  webServer: useExternalServer
    ? undefined
    : {
        command:
          "python3 -m http.server 4173 --bind 127.0.0.1 --directory site",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
