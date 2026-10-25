import { describe, expect, test } from "bun:test";
import { buildLocalLibName, buildRemoteLibName, buildRemoteUrl } from "../src/lib-name.ts";

describe("buildLocalLibName", () => {
  test("so and dylib get lib prefix", () => {
    expect(buildLocalLibName("foo", "so")).toBe("libfoo.so");
    expect(buildLocalLibName("foo", "dylib")).toBe("libfoo.dylib");
  });

  test("dll has no lib prefix", () => {
    expect(buildLocalLibName("foo", "dll")).toBe("foo.dll");
  });
});

describe("buildRemoteLibName", () => {
  test("linux uses arch", () => {
    expect(buildRemoteLibName("foo", "so", "x64")).toBe("x64.so");
    expect(buildRemoteLibName("foo", "so", "arm64")).toBe("arm64.so");
  });

  test("macOS uses local naming", () => {
    expect(buildRemoteLibName("foo", "dylib", "arm64")).toBe("libfoo.dylib");
  });

  test("windows uses name and arch", () => {
    expect(buildRemoteLibName("foo", "dll", "x64")).toBe("foo.x64.dll");
    expect(buildRemoteLibName("foo", "dll", "arm64")).toBe("foo.arm64.dll");
  });
});

describe("buildRemoteUrl", () => {
  test("with and without trailing slash", () => {
    const expected = "https://github.com/org/repo/releases/download/v1.0/x64.so";
    expect(buildRemoteUrl("https://github.com/org/repo/releases/download/v1.0", "x64.so")).toBe(
      expected,
    );
    expect(buildRemoteUrl("https://github.com/org/repo/releases/download/v1.0/", "x64.so")).toBe(
      expected,
    );
  });
});
