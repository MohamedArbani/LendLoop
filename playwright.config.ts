import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local")) loadEnvFile(".env.local");

const authenticated = process.env.E2E_AUTH === "1";
if (
  authenticated &&
  (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
    !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
    !process.env.NEXT_PUBLIC_CONVEX_URL)
) {
  throw new Error("Authenticated E2E tests require development Clerk keys and a test Convex URL.");
}

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  testMatch: authenticated ? "**/member.spec.ts" : "**/offline.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3100",
        url: baseURL,
        timeout: 120_000,
        env: {
          LENDLOOP_E2E: "1",
          ...(authenticated
            ? {}
            : {
                NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
                CLERK_SECRET_KEY: "",
                NEXT_PUBLIC_CONVEX_URL: "",
              }),
        },
      },
});
