#!/bin/bash
# Update Homebrew Cask formula with new version and SHA256 hashes
# Usage: ./scripts/update-homebrew-cask.sh <version>
# Example: ./scripts/update-homebrew-cask.sh 0.4.0
#
# This script is called by the CI release workflow after assets are uploaded.
# It downloads the DMG files, computes SHA256, updates the Cask formula,
# and pushes the changes to the homebrew-tap repository.

set -euo pipefail

VERSION="${1:?Usage: $0 <version>}"
REPO="legeling/PromptHub"
TAP_REPO="legeling/homebrew-tap"
CASK_FILE="Casks/prompthub.rb"

echo "Updating Homebrew Cask for PromptHub v${VERSION}..."

# Download DMGs and compute SHA256
ARM64_URL="https://github.com/${REPO}/releases/download/v${VERSION}/PromptHub-${VERSION}-arm64.dmg"
X64_URL="https://github.com/${REPO}/releases/download/v${VERSION}/PromptHub-${VERSION}-x64.dmg"

echo "Downloading arm64 DMG..."
curl -fSL -o /tmp/prompthub-arm64.dmg "$ARM64_URL"
ARM64_SHA=$(shasum -a 256 /tmp/prompthub-arm64.dmg | awk '{print $1}')
echo "arm64 SHA256: $ARM64_SHA"

echo "Downloading x64 DMG..."
curl -fSL -o /tmp/prompthub-x64.dmg "$X64_URL"
X64_SHA=$(shasum -a 256 /tmp/prompthub-x64.dmg | awk '{print $1}')
echo "x64 SHA256: $X64_SHA"

# Clone tap repo
WORK_DIR=$(mktemp -d)
echo "Cloning ${TAP_REPO} to ${WORK_DIR}..."
git clone "https://x-access-token:${GH_TOKEN}@github.com/${TAP_REPO}.git" "$WORK_DIR"

# Generate updated Cask formula
cat > "${WORK_DIR}/${CASK_FILE}" <<EOF
cask "prompthub" do
  version "${VERSION}"

  on_arm do
    sha256 "${ARM64_SHA}"
    url "https://github.com/${REPO}/releases/download/v#{version}/PromptHub-#{version}-arm64.dmg"
  end

  on_intel do
    sha256 "${X64_SHA}"
    url "https://github.com/${REPO}/releases/download/v#{version}/PromptHub-#{version}-x64.dmg"
  end

  name "PromptHub"
  desc "Cross-platform prompt management tool for AI workflows"
  homepage "https://github.com/${REPO}"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "PromptHub.app"

  zap trash: [
    "~/Library/Application Support/PromptHub",
    "~/Library/Preferences/com.prompthub.app.plist",
    "~/Library/Saved Application State/com.prompthub.app.savedState",
  ]
end
EOF

echo "Updated Cask formula:"
cat "${WORK_DIR}/${CASK_FILE}"

# Commit and push
cd "$WORK_DIR"
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add "${CASK_FILE}"
git commit -m "Update PromptHub to ${VERSION}" || echo "No changes to commit"
git push origin main

# Cleanup
rm -rf "$WORK_DIR" /tmp/prompthub-arm64.dmg /tmp/prompthub-x64.dmg

echo "Done! Homebrew Cask updated to v${VERSION}"
