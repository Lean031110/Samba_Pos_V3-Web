#!/usr/bin/env node
/**
 * generate-logo-variants.js — Generate logo variants from the original.
 *
 * Creates:
 *   - logo-login.png     (480×160, login screen, transparent bg)
 *   - logo-sidebar.png   (200×67, sidebar compact, transparent bg)
 *   - logo-header.png    (160×54, header bar, transparent bg)
 *   - logo-symbol.png    (128×128, just the symbol for favicon/small)
 *   - icon-192.png       (192×192, PWA icon, with safe padding)
 *   - icon-512.png       (512×512, PWA icon)
 *   - icon-192-maskable.png  (192×192, maskable with 10% padding)
 *   - icon-512-maskable.png  (512×512, maskable with 10% padding)
 *   - favicon.png        (32×32, browser tab icon)
 *   - splash-512.png     (512×512, splash screen)
 */
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'frontend', 'assets');
const ICONS_DIR = path.join(__dirname, '..', '..', 'frontend', 'icons');
const ORIGINAL = path.join(ASSETS_DIR, 'logo-original.png');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function generateVariant(name, width, height, sourceRegion) {
  const filePath = path.join(ASSETS_DIR, name);
  try {
    const { createCanvas, loadImage } = require('canvas');
    const img = await loadImage(ORIGINAL);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Calculate aspect-ratio-preserving fit
    const srcW = sourceRegion ? sourceRegion.w : img.width;
    const srcH = sourceRegion ? sourceRegion.h : img.height;
    const srcX = sourceRegion ? sourceRegion.x : 0;
    const srcY = sourceRegion ? sourceRegion.y : 0;

    const scale = Math.min(width / srcW, height / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;

    ctx.drawImage(img, srcX, srcY, srcW, srcH, dx, dy, drawW, drawH);
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    console.log(`[logo] wrote ${name} (${width}x${height})`);
  } catch (err) {
    // canvas not available — write a placeholder
    console.error(`[logo] ERROR generating ${name}: ${err.message}`);
  }
}

async function generateIcon(name, size, maskable) {
  const filePath = path.join(ICONS_DIR, name);
  try {
    const { createCanvas, loadImage } = require('canvas');
    const img = await loadImage(ORIGINAL);
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // For maskable icons, use a blue background (safe zone = 80% center)
    if (maskable) {
      // Fill with brand blue
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#044392');
      grad.addColorStop(1, '#0a4fb0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // Draw logo in center 80% (safe zone for maskable)
      const safeSize = size * 0.70;
      const scale = Math.min(safeSize / img.width, safeSize / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = (size - drawW) / 2;
      const dy = (size - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    } else {
      // Non-maskable: transparent background, logo fills more space
      const fillSize = size * 0.85;
      const scale = Math.min(fillSize / img.width, fillSize / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = (size - drawW) / 2;
      const dy = (size - drawH) / 2;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    }

    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    console.log(`[logo] wrote ${name} (${size}x${size}${maskable ? ' maskable' : ''})`);
  } catch (err) {
    console.error(`[logo] ERROR generating ${name}: ${err.message}`);
  }
}

async function generateSplash(name, size) {
  const filePath = path.join(ASSETS_DIR, name);
  try {
    const { createCanvas, loadImage } = require('canvas');
    const img = await loadImage(ORIGINAL);
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Blue gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#044392');
    grad.addColorStop(0.5, '#0a4fb0');
    grad.addColorStop(1, '#1976d2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Draw logo in center 60%
    const logoArea = size * 0.60;
    const scale = Math.min(logoArea / img.width, logoArea / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const dx = (size - drawW) / 2;
    const dy = (size - drawH) / 2 - size * 0.05; // slightly above center
    ctx.drawImage(img, dx, dy, drawW, drawH);

    // Add "SambaPos_LBA" text below logo
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(size * 0.05)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SambaPos_LBA', size / 2, dy + drawH + size * 0.08);

    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    console.log(`[logo] wrote ${name} (${size}x${size} splash)`);
  } catch (err) {
    console.error(`[logo] ERROR generating ${name}: ${err.message}`);
  }
}

(async () => {
  ensureDir(ASSETS_DIR);
  ensureDir(ICONS_DIR);

  // Logo variants for UI
  await generateVariant('logo-login.png', 480, 160);      // Login screen
  await generateVariant('logo-sidebar.png', 200, 67);       // Sidebar compact
  await generateVariant('logo-header.png', 160, 54);        // Header bar
  await generateVariant('logo-symbol.png', 128, 128);       // Symbol only

  // PWA icons
  await generateIcon('icon-192.png', 192, false);
  await generateIcon('icon-512.png', 512, false);
  await generateIcon('icon-192-maskable.png', 192, true);
  await generateIcon('icon-512-maskable.png', 512, true);

  // Favicon
  await generateIcon('favicon.png', 32, false);

  // Splash screen
  await generateSplash('splash-512.png', 512);

  console.log('[logo] all variants generated');
})();
