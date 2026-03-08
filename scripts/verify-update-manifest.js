#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const manifestPaths = process.argv.slice(2);
if (manifestPaths.length === 0) {
  console.error("Usage: node scripts/verify-update-manifest.js <manifest...>");
  process.exit(1);
}

function extractEntries(content) {
  const entryRegex =
    /- url:\s*(.+)\r?\n\s*sha512:\s*(.+)(?:\r?\n\s*size:\s*(\d+))?/g;
  const entries = [];
  let match;

  while ((match = entryRegex.exec(content)) !== null) {
    entries.push({
      url: match[1].trim(),
      sha512: match[2].trim(),
      size: match[3] ? Number(match[3]) : undefined,
    });
  }

  return entries;
}

function sha512Base64(filePath) {
  const hash = crypto.createHash("sha512");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("base64");
}

let hasError = false;

for (const manifestPath of manifestPaths) {
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    hasError = true;
    continue;
  }

  const content = fs.readFileSync(manifestPath, "utf8");
  const entries = extractEntries(content);
  if (entries.length === 0) {
    console.error(`Manifest has no file entries: ${manifestPath}`);
    hasError = true;
    continue;
  }

  const manifestDir = path.dirname(manifestPath);
  let manifestOk = true;
  for (const entry of entries) {
    const assetPath = path.join(manifestDir, entry.url);
    if (!fs.existsSync(assetPath)) {
      console.error(`Missing asset for ${manifestPath}: ${entry.url}`);
      hasError = true;
      manifestOk = false;
      continue;
    }

    const stats = fs.statSync(assetPath);
    if (typeof entry.size === "number" && stats.size !== entry.size) {
      console.error(
        `Size mismatch for ${entry.url}: manifest=${entry.size} actual=${stats.size}`,
      );
      hasError = true;
      manifestOk = false;
    }

    const actualSha = sha512Base64(assetPath);
    if (actualSha !== entry.sha512) {
      console.error(
        `SHA512 mismatch for ${entry.url}: manifest=${entry.sha512} actual=${actualSha}`,
      );
      hasError = true;
      manifestOk = false;
    }
  }

  if (manifestOk) {
    console.log(`Verified manifest: ${manifestPath}`);
  }
}

if (hasError) {
  process.exit(1);
}
