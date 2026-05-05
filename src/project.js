import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Walk up from `start` looking for the nearest `.project.toml` and return
 * its `slug` field. The slug is the portable, machine-independent project
 * identifier; absolute paths are not portable, so all pansophia tagging
 * uses the slug, never the directory.
 *
 * Returns null if no `.project.toml` is found, or no `slug` is set on the
 * one we found. Project tagging is opt-in: directories without a
 * `.project.toml` write to the global, untagged store, and recall there
 * shows the full cross-project view.
 */
export function findProjectSlug(start) {
  if (!start) return null;
  let dir;
  try { dir = resolve(start); } catch { return null; }
  while (true) {
    const candidate = `${dir}/.project.toml`;
    if (existsSync(candidate)) {
      const slug = readSlug(candidate);
      if (slug) return slug;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readSlug(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return null; }
  const match = raw.match(/^\s*slug\s*=\s*"([^"]+)"\s*$/m);
  return match ? match[1] : null;
}

export const IN_PROJECT_RELATION = 'in_project';
