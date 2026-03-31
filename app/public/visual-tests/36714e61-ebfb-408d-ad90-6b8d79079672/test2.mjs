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
const errors = [];

async function tryNavigateToProject(page) {
  // Look for project items and try to open one
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(3000);

  // Check what's on the page
  const html = await page.content();

  // Look for project navigation items
  const projectItems = await page.$$("[data-project-name], .project-row, .project-item, [href*='/project']");
  console.log(`Found ${projectItems.length} project items`);

  if (projectItems.length > 0) {
    const text = await projectItems[0].innerText().catch(() => "");
    console.log(`First project: "${text}"`);
    await projectItems[0].click();
    await sleep(3000);
    return true;
  }

  // Try clicking on any link that goes to a project
  const allLinks = await page.$$("a[href]");
  for (const link of allLinks) {
    const href = await link.getAttribute("href");
    const text = await link.innerText().catch(() => "");
    if (href && (href.includes("project") || href.includes("app"))) {
      console.log(`Clicking project link: ${href} - "${text}"`);
      await link.click();
      await sleep(3000);
      return true;
    }
  }

  return false;
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--use-gl=swiftshader",
      "--enable-accelerated-2d-canvas",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Capture console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
      console.log("  [console error]", msg.text().substring(0, 100));
    }
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
    console.log("  [page error]", err.message.substring(0, 100));
  });

  console.log("Navigating to Ivy Studio...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(4000);

  results.push({
    name: "01-initial-load",
    file: await screenshot(page, "01-initial-load", "Initial load of Ivy Studio"),
    desc: "Initial load of Ivy Studio",
  });

  // Check if there's an error overlay and dismiss it
  const errorDismiss = await page.$("button:has-text('Dismiss'), button:has-text('Close'), button:has-text('OK')");
  if (errorDismiss) {
    await errorDismiss.click();
    await sleep(1000);
  }

  // Check the page structure
  const bodyText = await page.innerText("body").catch(() => "");
  console.log("Page body snippet:", bodyText.substring(0, 300));

  // Look for the project list
  const titleEl = await page.$("title, h1, h2");
  const title = await titleEl?.innerText().catch(() => "");
  console.log("Page title:", title);

  // Find existing projects or navigate
  const projectNav = await tryNavigateToProject(page);

  results.push({
    name: "02-after-navigation",
    file: await screenshot(page, "02-after-navigation", "After navigation attempt"),
    desc: "After navigation attempt",
  });

  // Look for DottedBackground widget
  await sleep(2000);
  const bgToggler = await page.$(".background-toggler");
  if (bgToggler) {
    console.log("✅ Found background toggler!");
    results.push({
      name: "03-background-toggler",
      file: await screenshot(page, "03-background-toggler", "Background toggler found"),
      desc: "Background toggler visible",
    });

    // Test each background type
    const btns = await page.$$(".toggler-btn");
    console.log(`Found ${btns.length} toggler buttons`);
    for (const btn of btns) {
      const label = await btn.innerText();
      await btn.click();
      await sleep(2000);
      const safeName = label.toLowerCase().replace(/\s+/g, "-");
      results.push({
        name: `04-bg-${safeName}`,
        file: await screenshot(page, `04-bg-${safeName}`, `Background: ${label}`),
        desc: `Background type: ${label}`,
      });
    }
  } else {
    console.log("❌ Background toggler not found");
  }

  // Look for AnimatedBall / Orb toggle
  const ballToggle = await page.$(".ball-mode-toggle");
  if (ballToggle) {
    console.log("✅ Found ball mode toggle!");
    const modeBtns = await page.$$(".mode-btn");
    for (const btn of modeBtns) {
      const label = await btn.innerText();
      await btn.click();
      await sleep(2000);
      results.push({
        name: `05-ball-${label.toLowerCase()}`,
        file: await screenshot(page, `05-ball-${label.toLowerCase()}`, `Ball mode: ${label}`),
        desc: `Ball mode: ${label}`,
      });
    }
  } else {
    console.log("❌ Ball mode toggle not found");
  }

  // Try looking for any ivy-widget containers
  const ivyWidgets = await page.$$("ivy-widget, [data-widget-type]");
  console.log(`Found ${ivyWidgets.length} ivy widgets`);

  // Check if there are navigation items for projects
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(3000);

  results.push({
    name: "06-homepage",
    file: await screenshot(page, "06-homepage", "Homepage view"),
    desc: "Homepage view",
  });

  // Try to find and click on any visible project or demo
  const clickTargets = await page.$$("a, button, [role='button'], [role='listitem']");
  console.log(`Total clickable targets: ${clickTargets.length}`);

  for (let i = 0; i < Math.min(clickTargets.length, 20); i++) {
    const el = clickTargets[i];
    const text = await el.innerText().catch(() => "");
    const tag = await el.evaluate((n) => n.tagName).catch(() => "");
    if (text.trim()) {
      console.log(`  [${i}] ${tag}: "${text.trim().substring(0, 40)}"`);
    }
  }

  // Try to scroll and find more UI
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  // Look for specific CSS classes from the branch
  const dottedBg = await page.$(".dotted-background");
  const borderGlow = await page.$(".border-glow, [class*='border-glow']");

  console.log("dotted-background found:", !!dottedBg);
  console.log("border-glow found:", !!borderGlow);

  if (dottedBg) {
    const bbox = await dottedBg.boundingBox();
    console.log("DottedBackground bounding box:", bbox);
    await dottedBg.scrollIntoViewIfNeeded();
    await sleep(500);
    results.push({
      name: "07-dotted-background",
      file: await screenshot(page, "07-dotted-background", "DottedBackground widget"),
      desc: "DottedBackground widget found",
    });
  }

  // Look for any open project - try the first one
  // Try to find project entries
  const projectEntries = await page.$$("[class*='project'], [class*='item'], [class*='card']");
  console.log(`Found ${projectEntries.length} project-like elements`);

  if (projectEntries.length > 0) {
    for (let i = 0; i < Math.min(3, projectEntries.length); i++) {
      const text = await projectEntries[i].innerText().catch(() => "");
      console.log(`  Project entry ${i}: "${text.substring(0, 50)}"`);
    }
  }

  // Navigate to specific project URLs we know about
  // The TestApp folders we saw earlier
  const projectUrls = [
    "/app/DatabaseDashboard",
    "/app/DatabaseGenerator",
    "/app/HeyApp-7",
    "/app/ConcurrentTaskAnalyzer-2",
  ];

  for (const url of projectUrls) {
    try {
      const resp = await page.goto(`${BASE_URL}${url}`, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      if (resp && resp.status() < 400) {
        await sleep(3000);
        const pgTitle = await page.title();
        console.log(`  ${url} -> ${pgTitle}`);
        results.push({
          name: `08-${url.replace(/\//g, '-').replace(/^-/, '')}`,
          file: await screenshot(page, `08-${url.replace(/\//g, '-').replace(/^-/, '')}`, `Project: ${url}`),
          desc: `Project: ${url}`,
        });

        // Check for DottedBackground and togglers here
        const toggler2 = await page.$(".background-toggler");
        const ballToggle2 = await page.$(".ball-mode-toggle");
        console.log(`  background-toggler: ${!!toggler2}, ball-mode-toggle: ${!!ballToggle2}`);

        if (toggler2 || ballToggle2) {
          console.log(`  ✅ Found widgets in ${url}!`);
          break;
        }
      }
    } catch (e) {
      console.log(`  ${url}: error - ${e.message.substring(0, 50)}`);
    }
  }

  await browser.close();
  return { results, errors };
}

run()
  .then(({ results, errors }) => {
    console.log("\n=== RESULTS ===");
    console.log(JSON.stringify({ results, errors: errors.slice(0, 5) }, null, 2));
  })
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
