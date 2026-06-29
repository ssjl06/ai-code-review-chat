import { refractor } from "refractor";
import jsx from "refractor/jsx";
import tsx from "refractor/tsx";
import { tokenize, type HunkData } from "react-diff-view";

// refractor's "common" set already covers most languages (js, ts, python, go,
// rust, java, css, json, yaml, markdown, bash, sql, …). jsx/tsx are not in it.
try {
  refractor.register(jsx);
} catch {
  /* already registered */
}
try {
  refractor.register(tsx);
} catch {
  /* already registered */
}

// react-diff-view (v3) expects `refractor.highlight()` to return an array of
// nodes (the old refractor API). refractor v5 returns a hast Root, so adapt to
// its `.children` array.
const refractorAdapter = {
  highlight: (value: string, language: string) =>
    (refractor.highlight(value, language) as { children: unknown[] }).children,
};

// Tokenize a file's hunks for syntax highlighting. Returns undefined for plain
// text or unknown/unsupported languages, or if tokenization fails — callers then
// render the diff without highlighting rather than crashing.
export function highlightHunks(hunks: HunkData[], language: string) {
  if (language === "text" || !refractor.registered(language)) return undefined;
  try {
    return tokenize(hunks, {
      highlight: true,
      // Cast: our adapter matches the runtime shape react-diff-view consumes.
      refractor: refractorAdapter as never,
      language,
    });
  } catch {
    return undefined;
  }
}
