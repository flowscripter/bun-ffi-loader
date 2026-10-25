import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { suffix } from "bun:ffi";
import { getLibPath, LibraryNotFoundError } from "../index.ts";
import { buildLocalLibName, buildRemoteLibName } from "../src/lib-name.ts";

const libName = "ffi_loader_test";
const localName = buildLocalLibName(libName, suffix);
const remoteName = buildRemoteLibName(libName, suffix, process.arch);

let dir: string;
let embedded: string;
let releaseDir: string;
let installDir: string;
let requests: string[];
let server: ReturnType<typeof Bun.serve>;
let baseUri: string;

beforeAll(() => {
  requests = [];
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const pathname = new URL(req.url).pathname;
      if (!pathname.startsWith("/releases/")) return new Response("nope", { status: 404 });
      requests.push(pathname.slice("/releases/".length));
      return new Response("remote");
    },
  });
  baseUri = `http://localhost:${server.port}/releases`;
});

afterAll(() => server.stop(true));

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ffi-loader-"));
  embedded = path.join(dir, "embedded.bin");
  releaseDir = path.join(dir, "release");
  installDir = path.join(dir, "install");
  requests.length = 0;
});

afterEach(() => rm(dir, { recursive: true, force: true }));

async function place(file: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await Bun.write(file, "x");
}

describe("getLibPath", () => {
  test("prefers the embedded asset", async () => {
    await place(embedded);
    await place(path.join(releaseDir, localName));
    await place(path.join(installDir, localName));
    expect(await getLibPath(libName, { embedded, releaseDir, installDir, baseUri })).toBe(embedded);
  });

  test("falls through a missing embedded asset to the release build", async () => {
    const built = path.join(releaseDir, localName);
    await place(built);
    await place(path.join(installDir, localName));
    expect(await getLibPath(libName, { embedded, releaseDir, installDir, baseUri })).toBe(built);
  });

  test("falls back to the installed copy without downloading", async () => {
    const installed = path.join(installDir, localName);
    await place(installed);
    expect(await getLibPath(libName, { releaseDir, installDir, baseUri })).toBe(installed);
    expect(requests).toEqual([]);
  });

  test("downloads into the install dir as a last resort", async () => {
    const installed = path.join(installDir, localName);
    expect(await getLibPath(libName, { releaseDir, installDir, baseUri })).toBe(installed);
    expect(await Bun.file(installed).text()).toBe("remote");
    expect(requests).toEqual([remoteName]);
    expect(await readdir(installDir)).toEqual([localName]);
  });

  test("throws naming the candidates when there is no baseUri", async () => {
    const error = await getLibPath(libName, { embedded, releaseDir, installDir }).catch((e) => e);
    expect(error).toBeInstanceOf(LibraryNotFoundError);
    expect(error.libName).toBe(libName);
    expect(error.candidates).toEqual([
      embedded,
      path.join(releaseDir, localName),
      path.join(installDir, localName),
    ]);
    expect(error.message).toContain(embedded);
  });

  test("throws with the URL and leaves nothing behind when the download fails", async () => {
    const error = await getLibPath("missing_lib", {
      releaseDir,
      installDir,
      baseUri: baseUri.replace("releases", "nothing"),
    }).catch((e) => e);
    expect(error).toBeInstanceOf(LibraryNotFoundError);
    expect(error.candidates.at(-1)).toContain("/nothing/");
    expect(error.cause).toBeInstanceOf(Error);
    expect(
      await Bun.file(path.join(installDir, buildLocalLibName("missing_lib", suffix))).exists(),
    ).toBe(false);
  });

  test("throws and cleans up when the download cannot be saved", async () => {
    await mkdir(path.join(installDir, localName), { recursive: true });
    const error = await getLibPath(libName, { releaseDir, installDir, baseUri }).catch((e) => e);
    expect(error).toBeInstanceOf(LibraryNotFoundError);
    expect(await readdir(installDir)).toEqual([localName]);
  });

  test("throws when the server is unreachable", async () => {
    const error = await getLibPath(libName, {
      releaseDir,
      installDir,
      baseUri: "http://localhost:1/x",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(LibraryNotFoundError);
    expect(error.cause).toBeDefined();
  });
});
