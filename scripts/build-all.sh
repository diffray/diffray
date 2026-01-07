#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
DIST_DIR="dist"

echo "Building diffray v${VERSION} for all platforms..."

mkdir -p "$DIST_DIR"

# Build for each platform
# Note: Cross-compilation requires running on each platform or using Docker

# macOS ARM64 (Apple Silicon)
echo "Building for darwin-arm64..."
bun build ./bin/diffray.ts --compile --target=bun-darwin-arm64 --minify --outfile "$DIST_DIR/diffray-darwin-arm64"

# macOS x64 (Intel)
echo "Building for darwin-x64..."
bun build ./bin/diffray.ts --compile --target=bun-darwin-x64 --minify --outfile "$DIST_DIR/diffray-darwin-x64"

# Linux ARM64
echo "Building for linux-arm64..."
bun build ./bin/diffray.ts --compile --target=bun-linux-arm64 --minify --outfile "$DIST_DIR/diffray-linux-arm64"

# Linux x64
echo "Building for linux-x64..."
bun build ./bin/diffray.ts --compile --target=bun-linux-x64 --minify --outfile "$DIST_DIR/diffray-linux-x64"

# Windows x64
echo "Building for win-x64..."
bun build ./bin/diffray.ts --compile --target=bun-windows-x64 --minify --outfile "$DIST_DIR/diffray-win-x64.exe"

echo ""
echo "Build complete! Binaries in $DIST_DIR:"
ls -lh "$DIST_DIR"

echo ""
echo "Next steps:"
echo "1. Create GitHub release v${VERSION}"
echo "2. Upload all binaries from $DIST_DIR"
echo "3. Run: npm publish"
