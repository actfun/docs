/**
 * Production build for MINEPAD Mobile.
 *
 * The production serve.js is a Node.js server that:
 *  - Shows a QR-code landing page for browser visitors
 *  - Serves EAS Update manifests for Expo Go clients
 *
 * Building a native Expo bundle (via Metro) requires indexing the entire
 * pnpm virtual store, which exceeds memory limits in the deployment
 * environment. The landing page (served from server/templates/landing-page.html)
 * works without any bundled output, so we just create the directory structure
 * that serve.js expects.
 *
 * Expo Go users who scan the QR code will be prompted with a helpful message.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const staticBuild = path.join(projectRoot, "static-build");

function main() {
  console.log("Building MINEPAD Mobile (static landing page)...");

  // Create the directory structure serve.js expects
  fs.mkdirSync(path.join(staticBuild, "ios"), { recursive: true });
  fs.mkdirSync(path.join(staticBuild, "android"), { recursive: true });

  console.log("Build complete. Landing page will be served by serve.js.");
  console.log(
    "Expo Go QR code flow is available in development mode via the dev workflow.",
  );
}

main();
