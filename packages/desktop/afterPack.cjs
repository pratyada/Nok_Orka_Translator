/**
 * electron-builder afterPack hook.
 *
 * Copies bundle/server/node_modules into the packaged resources/server/.
 * Needed because electron-builder strips node_modules out of `extraResources`
 * when the source folder also contains a package.json (it thinks it should
 * manage deps itself, then doesn't). This hook side-steps that heuristic by
 * doing the copy after electron-builder is otherwise finished.
 */
const fs = require("fs");
const path = require("path");

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(src);
    try {
      fs.symlinkSync(target, dest);
    } catch {
      // Fall back to copy if symlink creation fails (Windows perms)
      fs.copyFileSync(path.resolve(path.dirname(src), target), dest);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

exports.default = async function afterPack(context) {
  const desktopDir = path.resolve(__dirname);
  const src = path.join(desktopDir, "bundle", "server", "node_modules");
  const dest = path.join(
    context.appOutDir,
    "resources",
    "server",
    "node_modules",
  );

  if (!fs.existsSync(src)) {
    throw new Error(
      `afterPack: bundle node_modules missing at ${src}. Did the build script run?`,
    );
  }

  console.log(`[afterPack] Copying server node_modules → ${dest}`);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyRecursive(src, dest);

  // Sanity check: critical deps land on disk
  const required = ["fastify", "openai", "ws", "@orka/shared"];
  for (const dep of required) {
    const depPath = path.join(dest, dep, "package.json");
    if (!fs.existsSync(depPath)) {
      throw new Error(`afterPack: required dep ${dep} missing at ${depPath}`);
    }
  }
  console.log(`[afterPack] Verified ${required.length} required deps.`);
};
