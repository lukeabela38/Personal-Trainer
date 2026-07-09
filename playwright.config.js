import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const useExternalServer = process.env.PLAYWRIGHT_USE_EXTERNAL_SERVER === "1";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? findChromiumBinary();

function findChromiumBinary() {
  const cacheRoot =
    process.platform === "darwin"
      ? path.join(homedir(), "Library", "Caches", "ms-playwright")
      : path.join(homedir(), ".cache", "ms-playwright");
  const candidates =
    process.platform === "darwin"
      ? [
          path.join(
            cacheRoot,
            "chromium-1223",
            "chrome-mac-arm64",
            "Google Chrome for Testing.app",
            "Contents",
            "MacOS",
            "Google Chrome for Testing",
          ),
          path.join(
            cacheRoot,
            "chromium_headless_shell-1223",
            "chrome-headless-shell-mac-arm64",
            "headless_shell",
          ),
          path.join(
            cacheRoot,
            "chromium-1181",
            "chrome-mac",
            "Chromium.app",
            "Contents",
            "MacOS",
            "Chromium",
          ),
        ]
      : [
          path.join(cacheRoot, "chromium-1181", "chrome-linux", "chrome"),
          path.join(cacheRoot, "chromium-1223", "chrome-linux", "chrome"),
          path.join(
            cacheRoot,
            "chromium_headless_shell-1181",
            "chrome-linux",
            "headless_shell",
          ),
          path.join(
            cacheRoot,
            "chromium_headless_shell-1223",
            "chrome-headless-shell-linux",
            "headless_shell",
          ),
        ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

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
