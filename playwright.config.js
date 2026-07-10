import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium, defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";
const useExternalServer = process.env.PLAYWRIGHT_USE_EXTERNAL_SERVER === "1";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  resolveChromiumExecutablePath();

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

function resolveChromiumExecutablePath() {
  const defaultExecutablePath = chromium.executablePath();
  if (isUsableBrowserExecutable(defaultExecutablePath)) {
    return defaultExecutablePath;
  }

  const cacheRoot = path.join(
    os.homedir(),
    "Library",
    "Caches",
    "ms-playwright",
  );
  if (!fs.existsSync(cacheRoot)) {
    return defaultExecutablePath;
  }

  const cacheEntries = fs.readdirSync(cacheRoot, { withFileTypes: true });
  for (const entry of cacheEntries) {
    if (!entry.isDirectory() || !entry.name.startsWith("chromium-")) continue;
    const entryRoot = path.join(cacheRoot, entry.name);
    const candidates = [
      path.join(
        entryRoot,
        "chrome-mac-arm64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing",
      ),
      path.join(
        entryRoot,
        "chrome-mac",
        "Chromium.app",
        "Contents",
        "MacOS",
        "Chromium",
      ),
    ];
    for (const candidate of candidates) {
      if (isUsableBrowserExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return defaultExecutablePath;
}

function isUsableBrowserExecutable(executablePath) {
  if (!fs.existsSync(executablePath)) {
    return false;
  }
  const contentsDir = path.dirname(path.dirname(executablePath));
  return fs.existsSync(path.join(contentsDir, "Frameworks"));
}
