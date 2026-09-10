#!/usr/bin/env node
// =====================================================================
// check-android-config.js — Android build pre-flight gate (PR #9)
// =====================================================================
// Run from the repository root (npm run test:android:config). Verifies
// everything Capacitor needs BEFORE gradle, so failures are reported
// with clear messages instead of a stack inside the Android build:
//
//   ✓ capacitor.config.json valid + appId + appName + webDir
//   ✓ frontend/ web assets exist
//   ✓ android/ project is versioned (not generated on the fly)
//   ✓ gradle wrapper present + executable script committed
//   ✓ applicationId = com.sambapos.lba
//   ✓ app_name = LBApos (strings.xml)
//   ✓ versionName valid semver + versionCode integer
//   ✓ splash + launcher icons present per density
//
// Exit code 1 on the first category that fails.
// =====================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;

function ok(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }

function section(name) { console.log(`\n=== ${name} ===`); }

// --- 1. Capacitor config -------------------------------------------------
section('Capacitor config');
const capPath = path.join(root, 'capacitor.config.json');
if (!fs.existsSync(capPath)) {
  fail('capacitor.config.json not found at repository root');
  process.exit(1);
}
let cap;
try {
  cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
} catch (e) {
  fail(`capacitor.config.json is not valid JSON: ${e.message}`);
  process.exit(1);
}
if (cap.appId === 'com.sambapos.lba') ok('appId = com.sambapos.lba');
else fail(`appId is "${cap.appId}" (expected com.sambapos.lba)`);
if (cap.appName === 'LBApos') ok('appName = LBApos');
else fail(`appName is "${cap.appName}" (expected LBApos)`);
if (cap.webDir === 'frontend') ok('webDir = frontend (static frontend, no build step)');
else fail(`webDir is "${cap.webDir}" (expected frontend)`);

// --- 2. Web assets ---------------------------------------------------------
section('Web assets (webDir)');
const webDir = path.join(root, cap.webDir || 'frontend');
for (const f of ['index.html', 'js/app.js', 'js/config.js', 'css/odoo19.css']) {
  if (fs.existsSync(path.join(webDir, f))) ok(`frontend/${f}`);
  else fail(`frontend/${f} missing`);
}

// --- 3. Android project versioned ---------------------------------------
section('Android project (versioned in git)');
const androidDir = path.join(root, 'android');
const requiredAndroid = [
  'app/build.gradle',
  'build.gradle',
  'settings.gradle',
  'gradle.properties',
  'gradlew',
  'gradle/wrapper/gradle-wrapper.properties',
  'gradle/wrapper/gradle-wrapper.jar',
  'app/src/main/AndroidManifest.xml',
  'app/src/main/res/values/strings.xml',
];
for (const f of requiredAndroid) {
  if (fs.existsSync(path.join(androidDir, f))) ok(`android/${f}`);
  else fail(`android/${f} missing — the Android project must be committed, not generated ad-hoc`);
}

// --- 4. Gradle identity gates --------------------------------------------
section('Gradle identity (appId / app_name / version)');
const gradle = fs.readFileSync(path.join(androidDir, 'app/build.gradle'), 'utf8');
const appIdMatch = gradle.match(/applicationId\s+["']([^"']+)["']/);
if (appIdMatch && appIdMatch[1] === 'com.sambapos.lba') ok('applicationId com.sambapos.lba');
else fail(`applicationId is "${appIdMatch ? appIdMatch[1] : 'NOT SET'}" (expected com.sambapos.lba)`);

const strings = fs.readFileSync(path.join(androidDir, 'app/src/main/res/values/strings.xml'), 'utf8');
if (/app_name[^>]*>LBApos</.test(strings)) ok('app_name = LBApos');
else fail('app_name is not LBApos (strings.xml)');

const versionNameMatch = gradle.match(/versionName\s+["']([^"']+)["']/);
const versionCodeMatch = gradle.match(/versionCode\s+(\d+)/);
if (versionNameMatch && /^\d+\.\d+\.\d+$/.test(versionNameMatch[1])) {
  ok(`versionName ${versionNameMatch[1]}`);
} else {
  fail(`versionName "${versionNameMatch ? versionNameMatch[1] : 'NOT SET'}" is not valid semver (x.y.z)`);
}
if (versionCodeMatch && parseInt(versionCodeMatch[1], 10) > 0) {
  ok(`versionCode ${versionCodeMatch[1]}`);
} else {
  fail('versionCode missing or not a positive integer');
}

// --- 5. Splash + launcher icons per density ----------------------------
section('Splash + launcher branding (versioned resources)');
const res = path.join(androidDir, 'app/src/main/res');
// Splash: full-screen compositions per orientation (the launch theme
// stretches android:background — port/land art at window aspect keeps
// the logo undeformed).
if (fs.existsSync(path.join(res, 'drawable', 'splash.png'))) ok('drawable/splash.png (square fallback)');
else fail('drawable/splash.png missing');
const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
for (const d of densities) {
  let missing = [];
  for (const orient of ['port', 'land']) {
    const splash = path.join(res, `drawable-${orient}-${d}`, 'splash.png');
    if (!fs.existsSync(splash)) missing.push(`drawable-${orient}-${d}/splash.png`);
  }
  if (missing.length === 0) ok(`drawable-port/land-${d}/splash.png`);
  else fail(`${missing.join(', ')} missing`);
}
for (const d of densities) {
  const icon = path.join(res, `mipmap-${d}`, 'ic_launcher.png');
  if (fs.existsSync(icon)) ok(`mipmap-${d}/ic_launcher.png`);
  else fail(`mipmap-${d}/ic_launcher.png missing`);
}
const adaptive = path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml');
if (fs.existsSync(adaptive)) ok('mipmap-anydpi-v26/ic_launcher.xml (adaptive icon)');
else fail('adaptive icon XML missing');

// --- 6. Portrait orientation (POS/KDS are vertical by design) ---------
section('Manifest');
const manifest = fs.readFileSync(path.join(androidDir, 'app/src/main/AndroidManifest.xml'), 'utf8');
if (/android:screenOrientation="portrait"/.test(manifest)) ok('portrait orientation locked (POS/KDS)');
else fail('android:screenOrientation="portrait" missing in AndroidManifest.xml');

// --- Verdict ---------------------------------------------------------------
console.log('');
if (failures > 0) {
  console.error(`✗ ANDROID CONFIG CHECK FAILED — ${failures} problem(s)`);
  process.exit(1);
}
console.log('✓ ANDROID CONFIG CHECK PASSED — Capacitor/Android ready for gradle');
