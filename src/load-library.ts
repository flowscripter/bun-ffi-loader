import { dlopen, type FFIFunction, type Library } from "bun:ffi";
import { getLibPath, type LoadLibraryOptions } from "./lib-path.ts";

type Open = <S extends Record<string, FFIFunction>>(path: string, symbols: S) => Library<S>;

export function createLoadLibrary(open: Open) {
  const cache = new Map<string, Promise<Library<any>>>();

  return function loadLibrary<S extends Record<string, FFIFunction>>(
    libName: string,
    symbols: S,
    options?: LoadLibraryOptions,
  ): Promise<Library<S>> {
    const cached = cache.get(libName);
    if (cached) {
      return cached;
    }
    const pending = (async () => {
      const lib = open(await getLibPath(libName, options), symbols);
      return {
        symbols: lib.symbols,
        close() {
          if (cache.get(libName) === pending) {
            cache.delete(libName);
            lib.close();
          }
        },
      };
    })();
    cache.set(libName, pending);
    pending.catch(() => {
      if (cache.get(libName) === pending) {
        cache.delete(libName);
      }
    });
    return pending;
  };
}

/**
 * Resolves (see {@link getLibPath}) and opens a native library. One handle is held per `libName`
 * for the process; later calls return it regardless of `symbols` or `options`. Failures are not cached.
 * Calling `close()` on the handle removes it from the cache so a later call reopens the library.
 */
export const loadLibrary = createLoadLibrary(dlopen);
