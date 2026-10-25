import os from "node:os";
import path from "node:path";
import { mkdir, rename, rm } from "node:fs/promises";
import { suffix } from "bun:ffi";
import { LibraryNotFoundError } from "./errors.ts";
import { buildLocalLibName, buildRemoteLibName, buildRemoteUrl } from "./lib-name.ts";

export interface LoadLibraryOptions {
  /** Release asset base URL used to download the library if it is not found locally. */
  baseUri?: string;
  /** Path of an embedded asset (e.g. from `import x from "./lib.so" with { type: "file" }`). */
  embedded?: string;
  /** Directory of installed libraries. Default: `~/.flowscripter/lib`. */
  installDir?: string;
  /** Directory of a local release build. Default: `target/release` relative to the working directory. */
  releaseDir?: string;
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.${process.pid}.${crypto.randomUUID()}.part`;
  try {
    await Bun.write(partial, response);
    await rename(partial, destination);
  } catch (e) {
    await rm(partial, { force: true });
    throw e;
  }
}

/**
 * Locates the native library, trying in order: the embedded asset, a local release build,
 * the installed copy and finally a download into the install directory.
 *
 * @throws LibraryNotFoundError naming every candidate tried if the library cannot be found.
 */
export async function getLibPath(
  libName: string,
  options: LoadLibraryOptions = {},
): Promise<string> {
  const fullLibName = buildLocalLibName(libName, suffix);
  const installedLibPath = path.join(
    options.installDir ?? path.join(os.homedir(), ".flowscripter", "lib"),
    fullLibName,
  );
  const candidates = [
    options.embedded,
    path.join(options.releaseDir ?? path.join("target", "release"), fullLibName),
    installedLibPath,
  ].filter((candidate): candidate is string => candidate !== undefined);

  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }
  }

  if (options.baseUri === undefined) {
    throw new LibraryNotFoundError(libName, candidates);
  }

  const remotePath = buildRemoteUrl(
    options.baseUri,
    buildRemoteLibName(libName, suffix, process.arch),
  );
  candidates.push(remotePath);
  try {
    await download(remotePath, installedLibPath);
  } catch (cause) {
    throw new LibraryNotFoundError(libName, candidates, { cause });
  }
  return installedLibPath;
}
