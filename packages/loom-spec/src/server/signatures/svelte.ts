import { extractTypeScriptSignature } from "./typescript.js";

/**
 * Extract the canonical signature for a function declared inside a
 * `<script>` block of a Svelte component. We extract the JS/TS portion
 * and delegate to the TypeScript extractor.
 *
 * Out of scope (for now): Svelte-specific surfaces like reactive
 * declarations (`$: foo = ...`), `export let prop`, stores. Those don't
 * have function-like signatures and aren't what `code_refs[].symbol`
 * targets in practice.
 */
export function extractSvelteSignature(
  source: string,
  symbol: string
): string | null {
  // Concatenate all <script> block contents and search across them.
  // Svelte allows up to two <script> blocks (one regular, one
  // `context="module"`); both can contain function declarations.
  const blocks = extractScriptBlocks(source);
  if (blocks.length === 0) return null;
  for (const block of blocks) {
    const result = extractTypeScriptSignature(block, symbol);
    if (result) return result;
  }
  return null;
}

function extractScriptBlocks(source: string): string[] {
  const blocks: string[] = [];
  // Permissive: any <script ...>...</script>; doesn't validate attributes.
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    blocks.push(m[1] ?? "");
  }
  return blocks;
}
