import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FFIType } from "bun:ffi";
import { LibraryNotFoundError, loadLibrary } from "../index.ts";
import { createLoadLibrary } from "../src/load-library.ts";

let dir: string;
let embedded: string;
let opened: string[];
let closed: number;

const fakeOpen = ((file: string, symbols: object) => {
  opened.push(file);
  return {
    symbols: Object.fromEntries(Object.keys(symbols).map((name) => [name, () => name])),
    close: () => {
      closed++;
    },
  };
}) as unknown as Parameters<typeof createLoadLibrary>[0];

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ffi-loader-"));
  embedded = path.join(dir, "embedded.bin");
  await Bun.write(embedded, "x");
  opened = [];
  closed = 0;
});

afterEach(() => rm(dir, { recursive: true, force: true }));

const symbols = { add: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } };

describe("loadLibrary", () => {
  test("opens the resolved path and caches the handle per libName", async () => {
    const load = createLoadLibrary(fakeOpen);
    const first = await load("a", symbols, { embedded });
    const second = await load("a", symbols, { embedded });
    expect(second).toBe(first);
    expect(opened).toEqual([embedded]);
    expect(first.symbols.add(1, 2)).toBe("add" as never);
  });

  test("concurrent calls share one open", async () => {
    const load = createLoadLibrary(fakeOpen);
    const [a, b] = await Promise.all([
      load("a", symbols, { embedded }),
      load("a", symbols, { embedded }),
    ]);
    expect(a).toBe(b);
    expect(opened.length).toBe(1);
  });

  test("different libNames get different handles", async () => {
    const load = createLoadLibrary(fakeOpen);
    expect(await load("a", symbols, { embedded })).not.toBe(await load("b", symbols, { embedded }));
  });

  test("close removes the handle from the cache and is idempotent", async () => {
    const load = createLoadLibrary(fakeOpen);
    const first = await load("a", symbols, { embedded });
    first.close();
    first.close();
    expect(closed).toBe(1);
    const second = await load("a", symbols, { embedded });
    expect(second).not.toBe(first);
    first.close();
    expect(closed).toBe(1);
    expect(opened.length).toBe(2);
  });

  test("a failed resolve is not cached", async () => {
    const load = createLoadLibrary(fakeOpen);
    const options = { releaseDir: path.join(dir, "r"), installDir: path.join(dir, "i") };
    await expect(load("a", symbols, options)).rejects.toBeInstanceOf(LibraryNotFoundError);
    const lib = await load("a", symbols, { ...options, embedded });
    expect(lib).toBeDefined();
  });

  test("a failed open is not cached", async () => {
    let fail = true;
    const load = createLoadLibrary(((file: string, s: Record<string, never>) => {
      if (fail) throw new Error("bad symbol");
      return fakeOpen(file, s);
    }) as Parameters<typeof createLoadLibrary>[0]);
    await expect(load("a", symbols, { embedded })).rejects.toThrow("bad symbol");
    fail = false;
    await load("a", symbols, { embedded });
    expect(opened).toEqual([embedded]);
  });
});

const realLib = [
  "/lib/x86_64-linux-gnu/libc.so.6",
  "/lib/aarch64-linux-gnu/libc.so.6",
  "/usr/lib64/libc.so.6",
  "C:\\Windows\\System32\\kernel32.dll",
].find((file) => Bun.file(file).size > 0);

describe("loadLibrary with the real dlopen", () => {
  test.skipIf(realLib === undefined)("loads a system library from an embedded path", async () => {
    const lib = await loadLibrary(
      "real",
      process.platform === "win32"
        ? { GetCurrentProcessId: { args: [], returns: FFIType.u32 } }
        : { abs: { args: [FFIType.i32], returns: FFIType.i32 } },
      { embedded: realLib },
    );
    if (process.platform === "win32") {
      expect((lib.symbols as any).GetCurrentProcessId()).toBe(process.pid);
    } else {
      expect((lib.symbols as any).abs(-5)).toBe(5);
    }
    lib.close();
  });
});
