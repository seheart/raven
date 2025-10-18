#!/bin/bash
# Build script for Raven on Linux (Arch/Ubuntu)

set -e

echo "🐦‍⬛ Raven Linux Build Script"
echo "============================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect distribution
if [ -f /etc/arch-release ]; then
    DISTRO="arch"
elif [ -f /etc/lsb-release ]; then
    DISTRO="ubuntu"
else
    DISTRO="unknown"
fi

echo -e "${BLUE}Detected distribution: $DISTRO${NC}"
echo ""

# Check dependencies
echo "Checking dependencies..."

MISSING_DEPS=()

# Check Rust
if ! command -v rustc &> /dev/null; then
    MISSING_DEPS+=("rust")
fi

# Check Node
if ! command -v node &> /dev/null; then
    MISSING_DEPS+=("nodejs")
fi

# Check npm
if ! command -v npm &> /dev/null; then
    MISSING_DEPS+=("npm")
fi

# Check pkg-config
if ! command -v pkg-config &> /dev/null; then
    MISSING_DEPS+=("pkg-config")
fi

# Check for webkit2gtk
if ! pkg-config --exists webkit2gtk-4.1; then
    MISSING_DEPS+=("webkit2gtk-4.1")
fi

# Check for gtk3
if ! pkg-config --exists gtk+-3.0; then
    MISSING_DEPS+=("gtk3")
fi

if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo -e "${RED}Missing dependencies:${NC}"
    for dep in "${MISSING_DEPS[@]}"; do
        echo "  - $dep"
    done
    echo ""
    echo "Install dependencies:"

    if [ "$DISTRO" = "arch" ]; then
        echo "  sudo pacman -S webkit2gtk-4.1 gtk3 base-devel curl wget file openssl"
    elif [ "$DISTRO" = "ubuntu" ]; then
        echo "  sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev"
    fi

    exit 1
fi

echo -e "${GREEN}✓ All dependencies found${NC}"
echo ""

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
echo ""

# Build frontend
echo "Building frontend..."
cd frontend
npm run build
cd ..
echo -e "${GREEN}✓ Frontend built${NC}"
echo ""

# Build Tauri app
echo "Building Tauri application..."
cargo tauri build

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Build successful!${NC}"
    echo ""
    echo "Build artifacts:"
    echo "  Binary: target/release/raven"

    if [ -d "target/release/bundle" ]; then
        echo "  Bundles:"
        find target/release/bundle -type f \( -name "*.deb" -o -name "*.AppImage" -o -name "*.rpm" \)
    fi

    echo ""
    echo "Run with: ./target/release/raven"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
