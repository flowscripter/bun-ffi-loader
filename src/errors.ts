/**
 * Thrown when a native library could not be located or downloaded.
 */
export class LibraryNotFoundError extends Error {
  readonly libName: string;
  readonly candidates: string[];

  constructor(libName: string, candidates: string[], options?: ErrorOptions) {
    super(`Native library "${libName}" not found. Tried: ${candidates.join(", ")}`, options);
    this.name = "LibraryNotFoundError";
    this.libName = libName;
    this.candidates = candidates;
  }
}
