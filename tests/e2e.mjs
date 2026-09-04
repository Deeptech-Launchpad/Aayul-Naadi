/**
 * End-to-end walk through every flow, against a running dev or production server.
 *
 *   npm run dev
 *   npm run test:e2e
 *
 * Over plain http://localhost the server must be started with
 * AAYU_INSECURE_COOKIES=1, or the browser refuses the Secure session cookie and
 * sign-up cannot complete — which is the flag doing its job, not a failure.
 *
 * It creates a throwaway account, enrols two-factor with a real TOTP code, loads
 * the sample record, visits all 24 screens, logs a reading, exports a FHIR
 * bundle, and checks that an unauthenticated request cannot reach the record.
 */
import { chromium } from "@playwright/test";
import * as OTPAuth from "otpauth";

const BASE = process.env.AAYU_BASE_URL ?? "http://localhost:3000";
const EMAIL = `e2e${Date.now()}@aayu.local`;
const PASS = "correct horse battery staple";
const OUT = process.env.AAYU_SHOTS ?? "./.data/screenshots";

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

const step = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name}: ${e.message}`); throw e; }
};
const shot = async (name) => page.screenshot({ path: `${OUT}/shot-${name}.png`, fullPage: true });

await step("sign up", async () => {
  await page.goto(`${BASE}/signup`);
  await page.fill("#email", EMAIL);
  await page.fill("#passphrase", PASS);
  await page.fill("#confirm", PASS);
  await page.click('button[type=submit]');
  await page.waitForURL("**/enroll", { timeout: 30000 });
});
await shot("01-enroll");

let secret;
await step("read TOTP secret and enrol", async () => {
  const shown = await page.locator(".mono").first().innerText();
  secret = shown.replace(/\s/g, "");
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
  await page.fill("#code", totp.generate());
  await page.click('button[type=submit]');
  await page.waitForURL("**/recovery-kit", { timeout: 30000 });
});
await shot("02-recovery");

await step("create recovery kit", async () => {
  await page.click('button[type=submit]');
  await page.waitForSelector(".code-grid", { timeout: 30000 });
  const codes = await page.locator(".code-grid div").allInnerTexts();
  if (codes.length !== 10) throw new Error(`expected 10 codes, got ${codes.length}`);
  await page.click('a.btn');
  await page.waitForURL("**/onboarding", { timeout: 30000 });
});
await shot("03-consent");

await step("consent", async () => {
  await page.click('button[type=submit]');
  await page.waitForURL("**/onboarding/basics", { timeout: 30000 });
});

await step("basics", async () => {
  await page.fill("#displayName", "Vellayan");
  await page.fill("#dob", "1974-03-12");
  await page.selectOption("#sexAtBirth", "male");
  await page.fill("#heightCm", "175");
  await page.fill("#weightKg", "74.2");
  await page.click('button[type=submit]');
  await page.waitForURL("**/onboarding/health", { timeout: 30000 });
});
await shot("04-health");

await step("add a condition", async () => {
  await page.fill("#condition-name", "Type 2 diabetes");
  await page.click('form button[type=submit]');
  await page.waitForSelector("text=Type 2 diabetes", { timeout: 30000 });
});

await step("skip to connect", async () => {
  await page.click('a:has-text("Skip the rest for now")');
  await page.waitForURL("**/onboarding/connect", { timeout: 30000 });
});
await shot("05-connect");

await step("load sample record", async () => {
  await page.click('button:has-text("Load sample record")');
  await page.waitForSelector("text=Sample record loaded", { timeout: 180000 });
});

await step("finish onboarding", async () => {
  await page.click('form button:has-text("Go to Today"), form button:has-text("Skip for now")');
  await page.waitForURL("**/today", { timeout: 60000 });
  await page.waitForSelector(".tile", { timeout: 30000 });
});
await shot("06-today");

for (const [name, path, wait] of [
  ["07-record", "/record", ".timeline"],
  ["08-labs", "/record/labs", ".card"],
  ["09-documents", "/record/documents", ".dropzone"],
  ["10-sources", "/record/sources", ".card"],
  ["11-nadi", "/nadi", ".composer"],
  ["12-care", "/care", ".card"],
  ["13-meds", "/care/medications", ".card"],
  ["14-visitprep", "/care/visit-prep", ".card"],
  ["15-profile", "/profile", ".card"],
  ["16-security", "/profile/security", ".card"],
  ["17-audit", "/profile/audit", ".timeline"],
  ["18-log", "/log", ".seg"],
  ["19-metric", "/metric/glucose_fasting", "svg"],
]) {
  await step(`visit ${path}`, async () => {
    await page.goto(`${BASE}${path}`);
    await page.waitForSelector(wait, { timeout: 30000 });
  });
  await shot(name);
}

await step("log a blood pressure reading", async () => {
  await page.goto(`${BASE}/log`);
  await page.fill("#systolic", "132");
  await page.fill("#diastolic", "84");
  await page.waitForSelector(".pill", { timeout: 10000 });
  const interpretation = await page.locator(".pill").first().innerText();
  if (!/stage/i.test(interpretation)) throw new Error(`unexpected interpretation: ${interpretation}`);
  await page.click('button[type=submit]');
  await page.waitForURL("**/today", { timeout: 30000 });
});

await step("blood pressure appears in the record", async () => {
  await page.goto(`${BASE}/metric/bp_systolic`);
  await page.waitForSelector("text=132", { timeout: 30000 });
});
await shot("20-bp");

await step("export as FHIR", async () => {
  const response = await page.request.get(`${BASE}/api/export?format=fhir`);
  if (!response.ok()) throw new Error(`export returned ${response.status()}`);
  const bundle = await response.json();
  if (bundle.resourceType !== "Bundle") throw new Error("not a FHIR bundle");
  const kinds = new Set(bundle.entry.map((e) => e.resource.resourceType));
  console.log(`   bundle: ${bundle.total} resources —`, [...kinds].join(", "));
});

await step("mark a care gap done", async () => {
  await page.goto(`${BASE}/care`);
  await page.click('button:has-text("Mark as done")');
  await page.waitForTimeout(2500);
});

await step("take a dose", async () => {
  await page.goto(`${BASE}/care/medications`);
  const button = page.locator('button:has-text("Take")').first();
  if (await button.count()) { await button.click(); await page.waitForTimeout(2000); }
});
await shot("21-meds-after");

await step("sign out", async () => {
  await page.goto(`${BASE}/profile`);
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("**/signin", { timeout: 30000 });
});

await step("sign back in with 2FA", async () => {
  await page.fill("#email", EMAIL);
  await page.fill("#passphrase", PASS);
  await page.click('button[type=submit]');
  await page.waitForURL("**/verify", { timeout: 30000 });
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
  await page.fill('input[name=code]', totp.generate());
  await page.click('button[type=submit]');
  await page.waitForURL("**/today", { timeout: 30000 });
});

await step("wrong passphrase is rejected", async () => {
  const fresh = await browser.newPage();
  await fresh.goto(`${BASE}/signin`);
  await fresh.fill("#email", EMAIL);
  await fresh.fill("#passphrase", "not the right passphrase");
  await fresh.click('button[type=submit]');
  // Next renders its own empty [role=alert] route announcer, so scope to ours.
  await fresh.waitForSelector(".notice.error", { timeout: 30000 });
  const text = await fresh.locator(".notice.error").first().innerText();
  if (!/do not match/i.test(text)) throw new Error(`unexpected error: ${text}`);
  await fresh.close();
});

await step("app pages require a session", async () => {
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/today`);
  await anonPage.waitForURL("**/signin", { timeout: 30000 });
  await anon.close();
});

// Only meaningful when the server was started with AAYU_DEMO_EMAIL and the
// account exists (npm run demo). Skipped otherwise so the default run is
// unaffected.
if (process.env.AAYU_DEMO_EMAIL) {
  await step("demo opens with no passphrase and no code", async () => {
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(`${BASE}/signin`);
    await guestPage.click('button:has-text("Look around the demo")');
    await guestPage.waitForURL("**/today", { timeout: 30000 });

    const flag = await guestPage.locator(".demo-flag").first().innerText();
    if (!/demo account/i.test(flag)) throw new Error(`no demo banner: ${flag}`);

    // The record has to be there, or the demo shows an empty app.
    await guestPage.goto(`${BASE}/record`);
    await guestPage.waitForSelector(".tev", { timeout: 30000 });

    await guestPage.goto(`${BASE}/profile/security`);
    await guestPage.click('button[aria-label="App lock"]');
    await guestPage.fill('input[name=pin]', "4821");
    await guestPage.click('button:has-text("Save app lock")');
    await guestPage.waitForSelector(".notice.error", { timeout: 30000 });
    const refusal = await guestPage.locator(".notice.error").first().innerText();
    if (!/switched off/i.test(refusal)) throw new Error(`app lock was not refused: ${refusal}`);

    await guest.close();
  });

  await step("the demo exemption does not extend to other accounts", async () => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`${BASE}/signin`);
    await otherPage.fill("#email", EMAIL);
    await otherPage.fill("#passphrase", PASS);
    await otherPage.click('button[type=submit]');
    // A real account still stops at the authenticator step.
    await otherPage.waitForURL("**/verify", { timeout: 30000 });
    await other.close();
  });
}

console.log(`\nEmail: ${EMAIL}`);
console.log(errors.length ? `\nBrowser errors:\n${errors.join("\n")}` : "\nNo browser console errors.");
await browser.close();
