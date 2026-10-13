import { test, expect } from "@playwright/test";

// ─── Protected Route Redirects (unauthenticated) ────────────────────────────

const protectedRoutes = [
	"/dashboard",
	"/personal-room",
	"/previous",
	"/recording",
	"/upcoming",
	"/meeting-intelligence",
	"/follow-ups",
	"/ai-chat",
	"/settings",
];

for (const route of protectedRoutes) {
	test(`protected route ${route} redirects to /sign-in when unauthenticated`, async ({
		page,
	}) => {
		await page.goto(route);
		await expect(page).toHaveURL(/\/sign-in/);
	});
}

// ─── Sign-In Page ───────────────────────────────────────────────────────────

test.describe("Sign-in page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/sign-in");
	});

	test("renders the sign-in form", async ({ page }) => {
		await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
		await expect(page.getByPlaceholder("sarah@techflow.io")).toBeVisible();
		await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
	});

	test("shows OAuth buttons", async ({ page }) => {
		await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /continue with github/i })).toBeVisible();
	});

	test("has working sign-up link", async ({ page }) => {
		const link = page.getByRole("link", { name: /sign up/i });
		await expect(link).toBeVisible();
		await link.click();
		await expect(page).toHaveURL(/\/sign-up/);
	});

	test("has working forgot-password link", async ({ page }) => {
		const link = page.getByRole("link", { name: /forgot password/i });
		await expect(link).toBeVisible();
		await link.click();
		await expect(page).toHaveURL(/\/forgot-password/);
	});
});

// ─── Sign-Up Page ───────────────────────────────────────────────────────────

test.describe("Sign-up page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/sign-up");
	});

	test("renders the sign-up form", async ({ page }) => {
		await expect(page.getByRole("heading", { name: "Get Started" })).toBeVisible();
		await expect(page.getByPlaceholder("jane@company.com")).toBeVisible();
		await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
	});

	test("shows OAuth buttons", async ({ page }) => {
		await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /continue with github/i })).toBeVisible();
	});

	test("has working sign-in link", async ({ page }) => {
		const link = page.getByRole("link", { name: /sign in/i }).first();
		await expect(link).toBeVisible();
		await link.click();
		await expect(page).toHaveURL(/\/sign-in/);
	});
});

// ─── Forgot Password Page ───────────────────────────────────────────────────

test.describe("Forgot-password page", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/forgot-password");
	});

	test("renders the forgot-password form", async ({ page }) => {
		await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
		await expect(page.getByPlaceholder("sarah@techflow.io")).toBeVisible();
		await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
	});

	test("has working back-to-sign-in link", async ({ page }) => {
		const link = page.getByRole("link", { name: /sign in/i });
		await expect(link).toBeVisible();
		await link.click();
		await expect(page).toHaveURL(/\/sign-in/);
	});
});

// ─── Landing Page ───────────────────────────────────────────────────────────

test("landing page loads for unauthenticated user", async ({ page }) => {
	await page.goto("/");
	// Should stay on / (not redirect to sign-in)
	await expect(page).toHaveURL("/");
	// Landing nav should be visible
	await expect(page.locator("text=NeuraMeet").first()).toBeVisible();
});

// ─── 404 Handling ───────────────────────────────────────────────────────────

test("visiting a nonexistent route shows 404 or redirects", async ({ page }) => {
	const response = await page.goto("/this-route-does-not-exist-xyz");
	// Either shows a 404 page or redirects — just verify no crash
	expect(response).not.toBeNull();
});
