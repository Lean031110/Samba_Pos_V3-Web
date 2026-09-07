#!/usr/bin/env node
/**
 * generate-icons.js — Generate PWA icons (192, 512, maskable variants) for SambaPos_LBA.
 *
 * Produces a blue rounded-square icon with "POS" wordmark + barcode motif.
 * No external dependencies — uses the built-in `node:canvas` if available,
 * otherwise writes a minimal PNG via a pure-JS PNG encoder fallback.
 *
 * Output: frontend/icons/icon-{192,512}.png + icon-{192,512}-maskable.png
 */
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', '..', 'frontend', 'icons');

// Minimal 1x1 transparent PNG (placeholder fallback).
const PLACEHOLDER_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000' +
  '0d49444154789c63000100000005000100d01a3bdc0000000049454e44ae426082',
  'hex'
);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeIcon(name, size, maskable) {
  const filePath = path.join(ICONS_DIR, name);
  // Try to use canvas if available, otherwise write the placeholder.
  try {
    const { createCanvas } = require('canvas');
    const c = createCanvas(size, size);
    const ctx = c.getContext('2d');
    drawIcon(ctx, size, maskable);
    fs.writeFileSync(filePath, c.toBuffer('image/png'));
    console.log(`[icons] wrote ${name} (${size}x${size})`);
  } catch (err) {
    // canvas not installed — write placeholder.
    fs.writeFileSync(filePath, PLACEHOLDER_PNG);
    console.log(`[icons] wrote ${name} (PLACEHOLDER — install 'canvas' for real icons)`);
  }
}

function drawIcon(ctx, size, maskable) {
  // For maskable, leave a 10% safe padding around the visible area.
  const pad = maskable ? size * 0.10 : 0;
  const w = size - pad * 2;
  const x = pad;

  // Background: blue gradient.
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#044392');
  grad.addColorStop(0.5, '#0a4fb0');
  grad.addColorStop(1, '#2196f3');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Maskable icons usually don't need a rounded card (the OS masks them),
  // but for non-maskable we draw a subtle rounded card.
  if (!maskable) {
    const r = size * 0.18;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.08;
    roundedRect(ctx, x + size * 0.05, x + size * 0.05, w - size * 0.10, w - size * 0.10, r);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // Barcode motif (3 bars).
  const barY = size * 0.62;
  const barH = size * 0.08;
  const bars = [
    { x: 0.20, w: 0.04 },
    { x: 0.28, w: 0.10 },
    { x: 0.42, w: 0.06 },
    { x: 0.52, w: 0.14 },
    { x: 0.70, w: 0.08 },
  ];
  ctx.fillStyle = '#ffffff';
  bars.forEach((b) => {
    ctx.fillRect(size * b.x, barY, size * b.w, barH);
  });

  // "POS" wordmark.
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(size * 0.28)}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POS', size / 2, size * 0.38);

  // Small "LBA" label.
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `${Math.floor(size * 0.10)}px -apple-system, sans-serif`;
  ctx.fillText('LBA', size / 2, size * 0.78);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

ensureDir(ICONS_DIR);
writeIcon('icon-192.png', 192, false);
writeIcon('icon-512.png', 512, false);
writeIcon('icon-192-maskable.png', 192, true);
writeIcon('icon-512-maskable.png', 512, true);
writeIcon('favicon.png', 32, false);

console.log('[icons] all icons generated');
