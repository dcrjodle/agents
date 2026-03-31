import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = __dirname;
const BASE_URL = "http://localhost:5010";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function screenshot(page, name, description) {
  const filename = `${name}.png`;
  await page.screenshot({
    path: path.join(OUTPUT_DIR, filename),
    fullPage: false,
  });
  console.log(`  [screenshot] ${filename} — ${description}`);
  return filename;
}

const results = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Capture console errors
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  console.log("Navigating to Ivy Studio...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);

  results.push({
    name: "01-initial-load",
    desc: "Initial load of Ivy Studio",
    file: await screenshot(page, "01-initial-load", "Initial load of Ivy Studio"),
  });

  // Look for a project with DottedBackground widget or AnimatedBall
  // First let's see what widgets/pages are available
  const bodyHTML = await page.content();

  // Try to find any DottedBackground or AnimatedBall widgets in the UI
  // Navigate to widget library / component showcase if available
  console.log("Looking for widget showcases...");

  // Check if there's a way to navigate to component demos
  // Try the /widgets or /components route
  try {
    await page.goto(`${BASE_URL}/widgets`, { waitUntil: "networkidle", timeout: 10000 });
    await sleep(1000);
    results.push({
      name: "02-widgets-page",
      desc: "Widgets page",
      file: await screenshot(page, "02-widgets-page", "Widgets page"),
    });
  } catch (e) {
    console.log("  /widgets not found, trying other routes...");
  }

  // Go back to main page
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);

  // Look for existing projects or create a test scenario
  // Check what's on the homepage
  const pageText = await page.innerText("body").catch(() => "");
  console.log("Page text snippet:", pageText.substring(0, 200));

  // Look for project links / navigation
  const links = await page.$$eval("a, button", (els) =>
    els.map((el) => ({
      text: el.textContent?.trim().substring(0, 50),
      href: el.getAttribute("href") || "",
      role: el.getAttribute("role") || el.tagName,
    }))
  );
  console.log("Found elements:", JSON.stringify(links.slice(0, 20), null, 2));

  // Try to open an existing project
  const projectLinks = await page.$$("[data-project], .project-item, [href*='project']");
  if (projectLinks.length > 0) {
    await projectLinks[0].click();
    await sleep(2000);
    results.push({
      name: "03-project-opened",
      desc: "First project opened",
      file: await screenshot(page, "03-project-opened", "First project opened"),
    });
  }

  // Try to find DottedBackground widget in the current view
  // Look for any background-toggler elements
  const toggler = await page.$(".background-toggler");
  if (toggler) {
    console.log("Found background toggler!");
    results.push({
      name: "04-background-toggler-found",
      desc: "Background toggler visible",
      file: await screenshot(page, "04-background-toggler-found", "Background toggler visible"),
    });

    // Click through different background modes
    const togglerBtns = await page.$$(".toggler-btn");
    for (let i = 0; i < togglerBtns.length; i++) {
      const label = await togglerBtns[i].innerText();
      await togglerBtns[i].click();
      await sleep(1500);
      results.push({
        name: `05-background-${label.toLowerCase().replace(/\s+/g, '-')}`,
        desc: `Background type: ${label}`,
        file: await screenshot(page, `05-background-${label.toLowerCase().replace(/\s+/g, '-')}`, `Background type: ${label}`),
      });
    }
  } else {
    console.log("Background toggler not found on current page");
  }

  // Look for AnimatedBall / mode toggle
  const ballModeToggle = await page.$(".ball-mode-toggle");
  if (ballModeToggle) {
    console.log("Found ball mode toggle!");
    const modebtns = await page.$$(".mode-btn");
    for (let i = 0; i < modebtns.length; i++) {
      const label = await modebtns[i].innerText();
      await modebtns[i].click();
      await sleep(1500);
      results.push({
        name: `06-ball-mode-${label.toLowerCase()}`,
        desc: `Ball mode: ${label}`,
        file: await screenshot(page, `06-ball-mode-${label.toLowerCase()}`, `Ball mode: ${label}`),
      });
    }
  }

  // Try to navigate to a test app or page that uses the widgets
  // Check if we can find the test app
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);

  // Look for project items in the UI
  const allElements = await page.$$("*[class*='project'], *[class*='card'], *[href], button");
  console.log(`Found ${allElements.length} clickable elements`);

  // Take a final screenshot showing the full UI
  results.push({
    name: "07-full-ui-overview",
    desc: "Full UI overview",
    file: await screenshot(page, "07-full-ui-overview", "Full UI overview"),
  });

  // Try scrolling to see more content
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  results.push({
    name: "08-scrolled-view",
    desc: "Scrolled view",
    file: await screenshot(page, "08-scrolled-view", "Scrolled view"),
  });

  // Try to open a project that might have dotted background widgets
  // Look for any "Open" or project name links
  const openButtons = await page.$$("button, a");
  for (const btn of openButtons.slice(0, 10)) {
    const text = await btn.innerText().catch(() => "");
    if (text && (text.toLowerCase().includes("open") || text.toLowerCase().includes("project") || text.toLowerCase().includes("test"))) {
      console.log(`Found button: "${text}"`);
    }
  }

  // Navigate back to check the project list
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(3000);

  results.push({
    name: "09-homepage-final",
    desc: "Homepage final state",
    file: await screenshot(page, "09-homepage-final", "Homepage final state"),
  });

  // Try to navigate directly to a widget showcase page
  // Check if there's a route that shows widgets
  const routes = ["/studio", "/home", "/app", "/dashboard", "/widgets", "/components"];
  for (const route of routes) {
    try {
      const response = await page.goto(`${BASE_URL}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 5000,
      });
      if (response && response.status() < 400) {
        await sleep(1000);
        const title = await page.title();
        console.log(`Route ${route} responded: ${title}`);
        results.push({
          name: `10-route-${route.replace('/', '')}`,
          desc: `Route ${route}`,
          file: await screenshot(page, `10-route-${route.replace(/\//g, '')}`, `Route: ${route}`),
        });
      }
    } catch (e) {
      // skip
    }
  }

  await browser.close();

  return { results, errors };
}

run()
  .then(({ results, errors }) => {
    console.log("\n=== RESULTS ===");
    console.log(JSON.stringify({ results, errors }, null, 2));
  })
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
