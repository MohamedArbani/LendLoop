import { expect, test } from "@playwright/test";

test("renders the public landing page without service credentials", async ({ page, request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('id="welcome-title"');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good tools. Better neighbors." })).toBeVisible();
  const browse = page.getByRole("link", { name: "Browse tools" });
  await browse.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#tool-board$/);
  await expect(page.getByText("The tool board is offline")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Sign in to lend or borrow" })).toHaveCount(0);
});

test("keeps the dashboard behind the public entry point without services", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Tool library" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Neighborhood board" })).toHaveCount(0);
});

test("follows the system theme by default and remembers explicit choices", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const root = page.locator("html");
  const toggle = page.getByRole("button", { name: "Change theme" });
  await expect(root).toHaveClass(/\bdark\b/);

  await toggle.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(root).toHaveClass(/\blight\b/);
  await page.reload();
  await expect(root).toHaveClass(/\blight\b/);

  await toggle.click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(root).toHaveClass(/\bdark\b/);
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(root).toHaveClass(/\bdark\b/);

  await toggle.click();
  await page.getByRole("menuitemradio", { name: "System" }).click();
  await expect(root).toHaveClass(/\blight\b/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveClass(/\bdark\b/);
});

test("shows a branded 404 with working back and home actions", async ({ page, request }) => {
  const missing = "/tools/missing-workbench";
  expect((await request.get(missing)).status()).toBe(404);

  await page.goto(missing);
  await expect(page.getByRole("heading", { name: "We couldn’t find that page." })).toBeVisible();
  await expect(page.getByRole("link", { name: "LendLoop" })).toHaveAttribute("href", "/");
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/?from=404");
  await page.goto(missing);
  await page.getByRole("button", { name: "Go back" }).press("Enter");
  await expect(page).toHaveURL(/\?from=404$/);

  await page.goto(missing);
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/);
});
