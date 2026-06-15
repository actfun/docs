const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the full workspace root so Metro can index files in node_modules/.pnpm/
// (pnpm stores all packages there via symlinks from the project's node_modules).
// Without this, Metro cannot resolve any npm package because their real paths
// are in .pnpm, outside the default watch scope.
config.watchFolders = [workspaceRoot];

// Enable symlink support for pnpm's virtual node_modules structure.
config.resolver.unstable_enableSymlinks = true;

// Where to look for node_modules when resolving imports.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
