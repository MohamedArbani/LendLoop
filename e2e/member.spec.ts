import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/nextjs/server";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getFunctionName } from "convex/server";
import { internal } from "../convex/_generated/api";
import { utcDay } from "../lib/catalog";

type TestMember = { id: string; emailAddress: string };

const test = base.extend<{ createMember: () => Promise<TestMember> }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
  createMember: async ({}, provide) => {
    const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const created: string[] = [];
    await provide(async () => {
      const emailAddress = `lendloop-e2e-${randomUUID()}@example.com`;
      const user = await client.users.createUser({
        emailAddress: [emailAddress],
        skipPasswordRequirement: true,
      });
      created.push(user.id);
      return { id: user.id, emailAddress };
    });
    for (const id of created) await client.users.deleteUser(id);
  },
});

test.beforeAll(() => clerkSetup({ dotenv: false }));

async function signIn(page: Page, { emailAddress }: TestMember) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await page.waitForFunction(() => window.Clerk?.loaded, undefined, { timeout: 15_000 });
  await clerk.signIn({ page, emailAddress });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Neighborhood board" })).toBeVisible();
}

function toolCard(page: Page, name: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function listTool(page: Page, name: string, description: string) {
  await page.getByRole("button", { name: "List a tool" }).click();
  const listing = page.getByRole("dialog", { name: "List a tool" });
  await listing.getByLabel("Tool name").fill(name);
  await listing.getByLabel("Description").fill(description);
  await listing.getByRole("button", { name: "Save listing" }).click();
  await expect(listing).toBeHidden();
}

async function openRequest(page: Page, name: string) {
  await toolCard(page, name).getByRole("button", { name: "Request dates" }).click();
  return page.getByRole("dialog", { name: `Request ${name}` });
}

async function pickRequestDay(page: Page, label: "First day" | "Return by", day: string) {
  await page.getByRole("button", { name: new RegExp(`^${label} `) }).click();
  const calendar = page.getByRole("dialog", { name: `${label} calendar` });
  const button = calendar.locator(`[role="gridcell"][data-day="${day}"]`).getByRole("button");
  const firstVisibleDay = await calendar.getByRole("gridcell").first().getAttribute("data-day");
  if (firstVisibleDay && (await button.count()) === 0) {
    await calendar
      .getByRole("button", { name: day < firstVisibleDay ? /previous month/i : /next month/i })
      .click();
  }
  await button.click();
  await expect(calendar).toBeHidden();
}

async function sendRequest(page: Page, name: string, start: string, end: string) {
  const dialog = await openRequest(page, name);
  await pickRequestDay(page, "First day", start);
  await pickRequestDay(page, "Return by", end);
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog).toBeHidden();
}

async function expectActivity(page: Page, tool: string, event: string, status: string) {
  const trigger = page.getByRole("button", { name: "Activity" });
  await trigger.click();
  const activity = page.getByRole("dialog", { name: "Activity" });
  const entry = activity
    .getByRole("button", {
      name: `View request details for ${tool}, ${event.toLowerCase()}`,
      exact: true,
    })
    .first();
  await entry.press("Enter");

  const details = page.getByRole("dialog", { name: "Request details" });
  await expect(details.getByRole("heading", { name: tool, exact: true })).toBeVisible();
  await expect(details.getByText(event, { exact: false })).toBeVisible();
  await expect(details.getByText(status, { exact: true })).toBeVisible();
  await expect(details.getByText("First day", { exact: true })).toBeVisible();
  await expect(details.getByText("Return by", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(entry).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
}

test("a guest can browse and is redirected from the dashboard", async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Good tools. Better neighbors." })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Sign in to", { exact: false }).first()).toBeVisible();
});

test("registers a new member, renders the dashboard on the server and signs out", async ({
  page,
  createMember,
}) => {
  await signIn(page, await createMember());
  await expect(page.getByRole("tab", { name: "All loans" })).toHaveCount(0);

  await page.addInitScript(() => {
    Reflect.set(window, "e2eSawGuest", false);
    new MutationObserver(() => {
      if (document.querySelector("#welcome-title")) Reflect.set(window, "e2eSawGuest", true);
    }).observe(document, { childList: true, subtree: true });
  });

  const response = await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Neighborhood board" })).toBeVisible();
  const originalRequest = response?.request().redirectedFrom();
  expect(originalRequest?.url()).toBe(new URL("/", page.url()).href);
  expect(await response?.text()).toContain('id="board-title"');
  expect(await page.evaluate(() => Reflect.get(window, "e2eSawGuest"))).toBe(false);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Neighborhood board" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "e2eSawGuest"))).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /open user menu/i }).click();
  await page.getByText("Sign out", { exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Good tools. Better neighbors." })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/$/);
});

test("listing and loan changes reach other sessions and the guest catalog", async ({
  page: lender,
  browser,
  baseURL,
  createMember,
}) => {
  test.setTimeout(180_000);
  const borrowerContext = await browser.newContext({ baseURL });
  const guestContext = await browser.newContext({ baseURL });
  const borrower = await borrowerContext.newPage();
  const guest = await guestContext.newPage();
  const originalName = `E2E drill ${randomUUID().slice(0, 8)}`;
  const name = `${originalName} updated`;
  const description = `Lender details for ${originalName}.`;
  const today = utcDay();
  const tomorrow = utcDay(Date.now() + 86_400_000);

  try {
    await signIn(lender, await createMember());
    await signIn(borrower, await createMember());
    await setupClerkTestingToken({ page: guest });
    await guest.goto("/");
    await expect(guest.getByRole("heading", { name: "Available to borrow" })).toBeVisible();

    const listButton = lender.getByRole("button", { name: "List a tool" });
    await listButton.click();
    await expect(lender.getByRole("dialog", { name: "List a tool" })).toBeVisible();
    await lender.keyboard.press("Escape");
    await expect(listButton).toBeFocused();
    await listTool(lender, originalName, description);
    await expect(toolCard(guest, originalName)).toBeVisible();
    await expect(guest.getByText(description, { exact: true })).toHaveCount(0);
    await expect(
      toolCard(borrower, originalName).getByRole("button", { name: "Edit listing" }),
    ).toHaveCount(0);

    await lender.getByRole("tab", { name: "My listings" }).click();
    await toolCard(lender, originalName).getByRole("button", { name: "Edit listing" }).click();
    const edit = lender.getByRole("dialog", { name: "Edit listing" });
    await edit.getByLabel("Tool name").fill(name);
    await edit.getByRole("button", { name: "Save listing" }).click();
    await expect(toolCard(guest, name)).toBeVisible();
    await expect(toolCard(guest, originalName)).toHaveCount(0);
    await expect
      .poll(async () => {
        const response = await guest.request.get("/");
        const html = await response.text();
        return response.ok() && html.includes(name) && !html.includes(description);
      })
      .toBe(true);

    const dashboard = await borrower.reload();
    expect(await dashboard?.text()).toContain(description);
    await borrower.getByRole("combobox", { name: "Category" }).click();
    await borrower.getByRole("option", { name: "Garden" }).click();
    await expect(toolCard(borrower, name)).toHaveCount(0);
    await borrower.getByRole("combobox", { name: "Category" }).click();
    await borrower.getByRole("option", { name: "Power tools" }).click();

    const request = await openRequest(borrower, name);
    const send = request.getByRole("button", { name: "Send request" });
    await expect(send).toBeDisabled();
    await pickRequestDay(borrower, "First day", today);
    await pickRequestDay(borrower, "Return by", today);
    await expect(send).toBeEnabled();
    await pickRequestDay(borrower, "First day", tomorrow);
    await expect(request.getByRole("button", { name: "Return by Pick a date" })).toBeVisible();
    await expect(send).toBeDisabled();
    await pickRequestDay(borrower, "First day", today);
    await pickRequestDay(borrower, "Return by", today);
    await send.click();
    await expect(request).toBeHidden();
    await expect(borrower.getByText("Request submitted.", { exact: true })).toBeVisible();
    await borrower.getByRole("tab", { name: "My requests" }).click();
    await expect(toolCard(borrower, name)).toContainText("Pending");
    await expectActivity(lender, name, "New borrow request", "Pending");
    await expect(toolCard(borrower, name)).toContainText("Notification logged");

    await lender.getByRole("tab", { name: "Incoming requests" }).click();
    await toolCard(lender, name).getByRole("button", { name: "Approve" }).click();
    await expect(toolCard(borrower, name)).toContainText("Approved");
    await expect(toolCard(guest, name)).toHaveCount(0);
    await expectActivity(borrower, name, "Request approved", "Approved");
    await expect(toolCard(borrower, name)).toContainText("Notification logged");
    await toolCard(lender, name).getByRole("button", { name: "Mark returned" }).click();
    await expect(toolCard(borrower, name)).toContainText("Returned");
    await expect(toolCard(guest, name)).toBeVisible();
    await expectActivity(borrower, name, "Return recorded", "Returned");
    await expect(toolCard(borrower, name)).toContainText("Notification logged");

    await borrower.getByRole("tab", { name: "Explore" }).click();
    await sendRequest(borrower, name, today, tomorrow);
    await toolCard(lender, name).getByRole("button", { name: "Decline" }).click();
    await borrower.getByRole("tab", { name: "My requests" }).click();
    await expectActivity(borrower, name, "Request declined", "Declined");
    await expect(toolCard(borrower, name).filter({ hasText: "Declined" })).toContainText(
      "Notification logged",
    );

    await borrower.getByRole("tab", { name: "Explore" }).click();
    await sendRequest(borrower, name, today, tomorrow);
    await borrower.getByRole("tab", { name: "My requests" }).click();
    await toolCard(borrower, name).getByRole("button", { name: "Cancel request" }).click();
    await expectActivity(lender, name, "Request cancelled", "Cancelled");
    await expect(toolCard(lender, name).filter({ hasText: "Cancelled" })).toContainText(
      "Notification logged",
    );

    await lender.getByRole("tab", { name: "My listings" }).click();
    await toolCard(lender, name).getByRole("button", { name: "Remove", exact: true }).click();
    await lender.getByRole("alertdialog").getByRole("button", { name: "Remove listing" }).click();
    await expect(toolCard(lender, name)).toHaveCount(0);
    await expect(toolCard(guest, name)).toHaveCount(0);
  } finally {
    await borrowerContext.close();
    await guestContext.close();
  }
});

test("an administrator can manage trust and moderate another member’s listing", async ({
  page: admin,
  browser,
  baseURL,
  createMember,
}) => {
  const adminKey = process.env.E2E_CONVEX_ADMIN_KEY;
  test.skip(!adminKey, "Set E2E_CONVEX_ADMIN_KEY for the disposable Convex deployment.");
  const lenderContext = await browser.newContext({ baseURL });
  const lender = await lenderContext.newPage();
  const member = await createMember();
  const setRole = async (role: "admin" | "user") => {
    const response = await fetch(new URL("/api/function", process.env.NEXT_PUBLIC_CONVEX_URL), {
      method: "POST",
      headers: { Authorization: `Convex ${adminKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        path: getFunctionName(internal.members.setRole),
        format: "convex_encoded_json",
        args: { subject: member.id, role },
      }),
    });
    expect(response.ok, "Convex role fixture HTTP status").toBe(true);
    expect(await response.json(), "Convex role fixture result").toMatchObject({
      status: "success",
    });
  };
  const name = `E2E saw ${randomUUID().slice(0, 8)}`;
  let promoted = false;
  try {
    await signIn(admin, member);
    await setRole("admin");
    promoted = true;
    await expect(admin.getByRole("tab", { name: "All loans" })).toBeVisible();
    await admin.reload();
    await admin.getByRole("tab", { name: "All loans" }).click();
    await expect(admin.getByRole("heading", { name: "All loans" })).toBeVisible();

    await signIn(lender, await createMember());
    await listTool(lender, name, "A saw for the moderation test.");
    await admin.getByRole("tab", { name: "Explore" }).click();
    await toolCard(admin, name).getByRole("button", { name: "Mark trusted lender" }).click();
    await expect(toolCard(lender, name)).toContainText("Trusted lender");
    await toolCard(admin, name).getByRole("button", { name: "Remove trusted badge" }).click();
    await expect(toolCard(lender, name)).not.toContainText("Trusted lender");

    await toolCard(admin, name).getByRole("button", { name: "Remove", exact: true }).click();
    await admin.getByRole("alertdialog").getByRole("button", { name: "Remove listing" }).click();
    await expect(toolCard(lender, name)).toHaveCount(0);
  } finally {
    await lenderContext.close();
    if (promoted) await setRole("user");
  }
});
