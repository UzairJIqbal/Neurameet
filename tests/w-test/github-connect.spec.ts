import { expect, test } from "@playwright/test";
import { api, createProject, person, prepare, signIn } from "./helpers";

// GitHub connect: the repos route builds links from the App's real slug, and the
// tab offers one Connect action. The GitHub side itself is driven by hand.
test.use({ actionTimeout: 30000, navigationTimeout: 60000 });
const A = person("a");

test("github tab links", async ({ browser }) => {
  test.setTimeout(240000);
  await prepare([A]);
  const a = await signIn(browser, A, "/dashboard");
  const projectId = await createProject(a.page, "GH", "GHC");
  const res = await api<{ installUrl?: string; authorizeUrl?: string }>(
    a.page,
    `/api/projects/${projectId}/github/repos`,
  );
  expect(res.status).toBe(200);
  const slug = new URL(res.body.installUrl as string).pathname.split("/")[2];
  console.log(`install slug: ${slug}`);
  console.log(`PROJECT=${projectId}`);
  await a.page.goto(`/projects/${projectId}?tab=github`);
  await expect(
    a.page.getByRole("link", { name: "Connect GitHub" }),
  ).toBeVisible({
    timeout: 30000,
  });
});
