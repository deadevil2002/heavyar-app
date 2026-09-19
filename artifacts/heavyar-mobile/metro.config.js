const { getDefaultConfig } = require("expo/metro-config");
const fs = require("node:fs");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

// Expo's pnpm monorepo defaults watch every sibling workspace plus the root
// dependency store. Heavyar Mobile does not import sibling workspaces. Watch
// only the real pnpm package locations used by this app so Metro can resolve
// symlinks without exhausting Replit's inotify allowance.
const pnpmStore = path.resolve(__dirname, "../../node_modules/.pnpm");
const packageTargets = fs.readdirSync(pnpmStore).flatMap((instance) => {
  const modules = path.join(pnpmStore, instance, "node_modules");
  if (!fs.existsSync(modules)) return [];
  return fs.readdirSync(modules).flatMap((name) => {
    const target = path.join(modules, name);
    if (!name.startsWith("@")) return [target];
    if (!fs.statSync(target).isDirectory()) return [];
    return fs.readdirSync(target).map((child) => path.join(target, child));
  });
}).flatMap((target) => {
  try {
    return [fs.realpathSync(target)];
  } catch {
    return [];
  }
});

module.exports = {
  ...config,
  watchFolders: [...new Set([...(config.watchFolders ?? []), ...packageTargets])],
};
