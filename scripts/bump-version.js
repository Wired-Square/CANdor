#!/usr/bin/env node
// Bump version across all config files
//
// Usage:
//   node bump-version.js         # patch: 0.2.10 → 0.2.11
//   node bump-version.js patch   # patch: 0.2.10 → 0.2.11
//   node bump-version.js minor   # minor: 0.2.10 → 0.3.0
//   node bump-version.js major   # major: 0.2.10 → 1.0.0

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiDir = join(__dirname, '..');
const tauriDir = join(uiDir, 'src-tauri');

// Parse bump type from args (default: patch)
const bumpType = process.argv[2] || 'patch';
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  console.error(`Invalid bump type: ${bumpType}`);
  console.error('Usage: node bump-version.js [major|minor|patch]');
  process.exit(1);
}

// Read current version from package.json
const packageJsonPath = join(uiDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// Parse and increment version
const parts = currentVersion.split('.').map(n => parseInt(n, 10));
if (bumpType === 'major') {
  parts[0] += 1;
  parts[1] = 0;
  parts[2] = 0;
} else if (bumpType === 'minor') {
  parts[1] += 1;
  parts[2] = 0;
} else {
  parts[2] += 1;
}
const newVersion = parts.join('.');

console.log(`Bumping version: ${currentVersion} → ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log(`  ✓ package.json`);

// Update Cargo.toml
const cargoTomlPath = join(tauriDir, 'Cargo.toml');
let cargoToml = readFileSync(cargoTomlPath, 'utf8');
cargoToml = cargoToml.replace(
  /^version = "[^"]+"/m,
  `version = "${newVersion}"`
);
writeFileSync(cargoTomlPath, cargoToml);
console.log(`  ✓ src-tauri/Cargo.toml`);

// Update tauri.conf.json
const tauriConfPath = join(tauriDir, 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log(`  ✓ src-tauri/tauri.conf.json`);

console.log(`\nVersion bumped to ${newVersion}`);
