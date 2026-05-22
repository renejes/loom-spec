/**
 * Minimal OTLP JSON parser. Reads the standard OpenTelemetry resource/scope/
 * spans shape (`resourceSpans[].scopeSpans[].spans[]`) and projects it down
 * to a flat list of normalized spans suitable for translating into a
 * loom-spec timeline.
 *
 * Scope: just enough of the OTLP JSON shape for the import-trace CLI.
 * Does NOT validate exhaustively, does NOT handle protobuf binary, does NOT
 * walk Jaeger or Zipkin formats — those can be follow-ons.
 */

export interface ParsedSpan {
  spanId: string;
  parentSpanId: string | null;
  /** Service that emitted the span (from resource attribute). */
  serviceName: string | null;
  /** Span name (often the operation or route). */
  name: string;
  /** "server" | "client" | "internal" | "producer" | "consumer" | "unknown". */
  kind: SpanKind;
  /** Start time in nanoseconds since UNIX epoch. */
  startNs: bigint;
  /** End time in nanoseconds since UNIX epoch. */
  endNs: bigint;
  /** Flattened key→value of attributes (resource + span merged; span wins). */
  attributes: Record<string, string | number | boolean>;
}

export type SpanKind =
  | "internal"
  | "server"
  | "client"
  | "producer"
  | "consumer"
  | "unknown";

const KIND_MAP: Record<number, SpanKind> = {
  0: "unknown",
  1: "internal",
  2: "server",
  3: "client",
  4: "producer",
  5: "consumer",
};

interface OtlpAttribute {
  key: string;
  value?: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

interface OtlpSpan {
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number | string;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: OtlpAttribute[];
}

interface OtlpScopeSpans {
  spans?: OtlpSpan[];
}

interface OtlpResourceSpans {
  resource?: { attributes?: OtlpAttribute[] };
  scopeSpans?: OtlpScopeSpans[];
}

interface OtlpRoot {
  resourceSpans?: OtlpResourceSpans[];
}

function attrValue(a: OtlpAttribute): string | number | boolean | undefined {
  const v = a.value;
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  return undefined;
}

function flattenAttrs(attrs: OtlpAttribute[] | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const a of attrs ?? []) {
    const v = attrValue(a);
    if (v !== undefined) out[a.key] = v;
  }
  return out;
}

function toBigInt(t: string | number | undefined): bigint {
  if (t === undefined) return 0n;
  if (typeof t === "number") return BigInt(t);
  return BigInt(t);
}

function normalizeKind(k: number | string | undefined): SpanKind {
  if (typeof k === "number") return KIND_MAP[k] ?? "unknown";
  if (typeof k === "string") {
    // OTLP exporters sometimes emit "SPAN_KIND_SERVER" etc.
    const lower = k.replace(/^SPAN_KIND_/i, "").toLowerCase();
    if (lower in { internal: 1, server: 1, client: 1, producer: 1, consumer: 1 }) {
      return lower as SpanKind;
    }
    return "unknown";
  }
  return "unknown";
}

/**
 * Parse an OTLP JSON object (already JSON.parsed) into normalized spans.
 * Throws if `resourceSpans` is missing — we don't try to recover or guess.
 */
export function parseOtlpJson(raw: unknown): ParsedSpan[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Trace file is not a JSON object");
  }
  const root = raw as OtlpRoot;
  if (!Array.isArray(root.resourceSpans)) {
    throw new Error(
      "Not an OTLP JSON trace — expected top-level 'resourceSpans' array. " +
        "Jaeger/Zipkin formats are not yet supported."
    );
  }
  const out: ParsedSpan[] = [];
  for (const rs of root.resourceSpans) {
    const resourceAttrs = flattenAttrs(rs.resource?.attributes);
    const serviceName = (resourceAttrs["service.name"] as string | undefined) ?? null;
    for (const ss of rs.scopeSpans ?? []) {
      for (const s of ss.spans ?? []) {
        const spanAttrs = flattenAttrs(s.attributes);
        const attributes = { ...resourceAttrs, ...spanAttrs };
        out.push({
          spanId: s.spanId ?? "",
          parentSpanId:
            s.parentSpanId && s.parentSpanId.length > 0 ? s.parentSpanId : null,
          serviceName,
          name: s.name ?? "(unnamed)",
          kind: normalizeKind(s.kind),
          startNs: toBigInt(s.startTimeUnixNano),
          endNs: toBigInt(s.endTimeUnixNano),
          attributes,
        });
      }
    }
  }
  return out;
}
