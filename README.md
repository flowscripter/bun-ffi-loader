# bun-ffi-loader

[![version](https://img.shields.io/github/v/release/flowscripter/bun-ffi-loader?sort=semver)](https://github.com/flowscripter/bun-ffi-loader/releases)
[![build](https://img.shields.io/github/actions/workflow/status/flowscripter/bun-ffi-loader/release-bun-library.yml)](https://github.com/flowscripter/bun-ffi-loader/actions/workflows/release-bun-library.yml)
[![coverage](https://codecov.io/gh/flowscripter/bun-ffi-loader/graph/badge.svg)](https://codecov.io/gh/flowscripter/bun-ffi-loader)
[![docs](https://img.shields.io/badge/docs-API-blue)](https://flowscripter.github.io/bun-ffi-loader/index.html)
[![license: MIT](https://img.shields.io/github/license/flowscripter/bun-ffi-loader)](https://github.com/flowscripter/bun-ffi-loader/blob/main/LICENSE)

> Resolve, download and load native libraries via Bun FFI

## Bun Module Usage

Add the module:

`bun add @flowscripter/bun-ffi-loader`

Load a native library and call it:

```typescript
import { FFIType } from "bun:ffi";
import { loadLibrary } from "@flowscripter/bun-ffi-loader";
import embedded from "./libmylib.so" with { type: "file" }; // optional, for `bun build --compile`

const { symbols, close } = await loadLibrary(
  "mylib",
  { add: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } },
  {
    embedded,
    baseUri: "https://github.com/acme/mylib/releases/download/v1.0.0",
  },
);

symbols.add(2, 2); // 4
close();
```

Only locate the library without opening it:

```typescript
import { getLibPath } from "@flowscripter/bun-ffi-loader";

const path = await getLibPath("mylib", { baseUri: "https://example.com/releases/v1.0.0" });
```

## Development

Install dependencies:

`bun install`

Build (produces `dist/` for Node.js and TypeScript consumers; Bun uses raw source directly):

`bun run build`

Test:

`bun test`

Format:

`bunx oxfmt`

Lint:

`bunx oxlint index.ts src/ tests/`

Generate HTML API Documentation:

`bunx typedoc index.ts`

## Documentation

### Library Resolution

`getLibPath(libName, options)` and `loadLibrary(libName, symbols, options)` look for the library file in this order and use the first hit:

1. `options.embedded`: an embedded asset path (from `import x from "./lib.so" with { type: "file" }`), so compiled hosts need no download
2. a local release build: `target/release` relative to the working directory (override with `options.releaseDir`)
3. the installed copy in `~/.flowscripter/lib` (override with `options.installDir`)
4. a download from `options.baseUri` into the install directory (skipped if `baseUri` is not set)

The local file name is `lib<name>.so`, `lib<name>.dylib` or `<name>.dll`, based on the platform suffix reported by `bun:ffi`. The remote file name is `<arch>.so` on Linux, `<name>.<arch>.dll` on Windows and `lib<name>.dylib` on macOS, appended to `baseUri`.

Downloads are written to a temporary file and renamed into place, so a failed download never leaves a partial library behind. If no candidate exists, a `LibraryNotFoundError` is thrown listing every candidate tried (`candidates`), with the download error as `cause`.

### Handle Caching

`loadLibrary` returns the `Library` from `bun:ffi` with typed `symbols` and a `close()` function. One handle is held per `libName` for the process, and later calls return it regardless of the `symbols` or `options` passed. Concurrent calls share a single open. A failed resolve, download or open is not cached, so a retry works. Calling `close()` removes the handle from the cache so a later `loadLibrary` reopens the library, and a repeated `close()` is a no-op.

### API

Link to auto-generated API docs:

[API Documentation](https://flowscripter.github.io/bun-ffi-loader/index.html)

## License

MIT © Flowscripter
