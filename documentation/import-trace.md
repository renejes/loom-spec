# `loom-spec import-trace`

Turn a real OpenTelemetry trace into a timeline. The resulting `.timeline.json`
overlays the diagram you name, so the spans you actually captured in
production line up with the architecture you previously sketched — useful for
perf regression review, capacity planning, or simply checking that the
implementation matches the planned flow.

## Usage

```sh
loom-spec import-trace <trace.json> --as <timeline-id> --diagram <diagram-id> \
                       [--map <mapping.json>] [--append] [--root <dir>]
```

- `<trace.json>` — an OTLP-JSON trace export (the standard
  `{ resourceSpans: [...] }` shape). Jaeger and Zipkin formats are not yet
  supported.
- `--as` — id for the new (or appended-to) timeline. Becomes
  `.loom/timelines/<id>.timeline.json`.
- `--diagram` — id of the diagram this timeline overlays. Spans are mapped to
  nodes from this diagram.
- `--map` — optional JSON file with explicit span → node and service → node
  overrides. See [mapping file format](#mapping-file-format) below.
- `--append` — instead of overwriting, merge the imported events into the
  existing timeline. The existing timeline must reference the same diagram.
- `--root` — start walking up from this directory to find `.loom/`. Defaults
  to the current working directory.

## Span → node mapping

For each span the CLI tries, in order:

1. The mapping file's `spans` table (`span.name` → node id) if `--map` was passed.
2. The mapping file's `services` table (`service.name` → node id) if `--map` was passed.
3. **Heuristic** — try the span name first, then the service name, and for each:
   1. Exact match against a node id.
   2. Node id appears as a substring of the candidate (e.g. span name
      `"todo-store update"` resolves to node id `todo-store`).
   3. Candidate appears in a node label.
   4. Candidate appears in any node's `code_refs[].path`.

Spans the CLI can't map are skipped with a warning. Pass `--map` to handle
the long tail explicitly.

## Time normalization

The earliest span start becomes `t = 0`. All `start_ms` and `duration_ms`
values are computed relative to that anchor, so the timeline is portable
across runs (no absolute timestamps survive the import).

## Causation

If span B has `parentSpanId == A`, and both A and B were mapped to nodes,
the corresponding event for B gets `triggered_by` set to the event id of A.
This drives the timeline view's causation arrows.

## Span kinds → event kinds

| OTLP span kind | event kind |
|---|---|
| INTERNAL | `compute` |
| SERVER / CLIENT / PRODUCER / CONSUMER | `io` |
| (unset / unknown) | `compute` |

## Mapping file format

```json
{
  "services": {
    "checkout-api": "checkout-service",
    "stripe-proxy": "payments"
  },
  "spans": {
    "POST /checkout": "checkout-service",
    "stripe.charge": "payments"
  }
}
```

The `spans` table wins over `services` when both match a given span.

## Example

```sh
# Imagine you have ./traces/checkout-run.json from an OpenTelemetry
# collector. Map it onto the 'overview' diagram as 'observed-checkout':

loom-spec import-trace ./traces/checkout-run.json \
  --as observed-checkout \
  --diagram overview \
  --map ./traces/checkout-mapping.json
```

The new timeline appears under `.loom/timelines/observed-checkout.timeline.json`,
opens in the editor at `#timeline:observed-checkout`, and plays back like
any hand-authored timeline — with real latencies and real causation.

## Not yet implemented

- Jaeger and Zipkin JSON formats. Convert via `otel-cli` or `opentelemetry-jaeger`
  first, then import.
- Protobuf OTLP. Use a JSON exporter.
- A side-by-side "planned vs. observed" diff view in the editor. Tracked
  separately as a Phase-2-stretch idea.

## Testing

The smoke test at `packages/loom-spec/scripts/smoke-import-trace.ts` builds
a 3-span OTLP trace in `/tmp`, runs the CLI against the todo-app fixture,
and asserts the resulting timeline structure (node mapping, ordering,
causation, schema-validity) before cleaning up.

Run it directly:

```sh
pnpm --filter loom-spec exec tsx scripts/smoke-import-trace.ts
```
