import { findLoomRoot } from "../server/findLoomRoot.js";
import {
  runDriftCheck,
  type DiagramReport,
  type JourneyReport,
  type DriftCaptureMode,
} from "../server/drift.js";

export interface ValidateArgs {
  root: string;
  json: boolean;
  capture?: DriftCaptureMode;
}

const ICON_OK = "✓";
const ICON_BAD = "✗";
const ICON_WARN = "⚠";
const ICON_INFO = "·";

function formatIssue(detail: string | undefined, issue: string): string {
  switch (issue) {
    case "missing-file":
      return `file not found`;
    case "missing-symbol":
      return detail ?? "symbol not found";
    case "lines-out-of-range":
      return `lines ${detail}`;
    case "invalid-lines":
      return `invalid line range ${detail}`;
    case "signature-drift":
      return `signature drift\n      ${detail}`;
    case "signature-missing":
      return `no signature hint captured yet (run with --capture)`;
    default:
      return issue;
  }
}

function isWarn(issue: string): boolean {
  return issue === "signature-missing";
}

function printDiagram(d: DiagramReport): void {
  const hasErrors =
    d.schemaErrors.length > 0 ||
    d.drift.some((f) => !isWarn(f.issue));
  const hasWarn = d.drift.some((f) => isWarn(f.issue));
  const status = hasErrors ? ICON_BAD : hasWarn ? ICON_WARN : ICON_OK;
  console.log(`${status} ${d.diagramId}.flow.json — ${d.title}`);
  console.log(
    `  ${d.nodeCount} nodes, ${d.edgeCount} edges, ${d.refsChecked} code refs checked${d.staleNodes > 0 ? `, ${d.staleNodes} stale` : ""}`
  );
  for (const err of d.schemaErrors) {
    console.log(`  ${ICON_BAD} schema: ${err}`);
  }
  for (const f of d.drift) {
    const icon = isWarn(f.issue) ? ICON_WARN : ICON_BAD;
    console.log(
      `  ${icon} ${f.nodeId} → ${f.ref.path}${f.ref.symbol ? `#${f.ref.symbol}` : ""}: ${formatIssue(f.detail, f.issue)}`
    );
  }
  if (d.schemaErrors.length === 0 && d.drift.length === 0) {
    console.log(`  ${ICON_INFO} no issues`);
  }
}

function printJourney(j: JourneyReport): void {
  const hasErrors =
    j.schemaErrors.length > 0 ||
    j.drift.some((f) => !isWarn(f.issue));
  const hasWarn = j.drift.some((f) => isWarn(f.issue));
  const status = hasErrors ? ICON_BAD : hasWarn ? ICON_WARN : ICON_OK;
  console.log(`${status} ${j.journeyId}.journey.json — ${j.title}`);
  console.log(
    `  walks ${j.diagram}, ${j.stepCount} steps, ${j.refsChecked} step code refs checked`
  );
  for (const err of j.schemaErrors) {
    console.log(`  ${ICON_BAD} schema: ${err}`);
  }
  for (const f of j.drift) {
    const icon = isWarn(f.issue) ? ICON_WARN : ICON_BAD;
    console.log(
      `  ${icon} step ${f.stepId} → ${f.ref.path}${f.ref.symbol ? `#${f.ref.symbol}` : ""}: ${formatIssue(f.detail, f.issue)}`
    );
  }
  if (j.schemaErrors.length === 0 && j.drift.length === 0) {
    console.log(`  ${ICON_INFO} no issues`);
  }
}

export async function runValidate(args: ValidateArgs): Promise<void> {
  let loomRoot;
  try {
    loomRoot = await findLoomRoot(args.root);
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exit(1);
  }

  const report = await runDriftCheck(loomRoot.rootPath, loomRoot.loomPath, {
    capture: args.capture,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.totalDrift + report.totalSchemaErrors > 0 ? 1 : 0);
    return;
  }

  console.log(`loom-spec validate${args.capture && args.capture !== "none" ? ` --${args.capture}` : ""}`);
  console.log(`  root: ${loomRoot.rootPath}`);
  console.log();

  for (const d of report.perDiagram) {
    printDiagram(d);
    console.log();
  }
  for (const j of report.perJourney) {
    printJourney(j);
    console.log();
  }

  const summary: string[] = [];
  if (report.totalSchemaErrors > 0) {
    summary.push(`${report.totalSchemaErrors} schema error(s)`);
  }
  if (report.totalDrift > 0) {
    summary.push(`${report.totalDrift} drift finding(s)`);
  }
  if (report.totalSignatureMissing > 0) {
    summary.push(
      `${report.totalSignatureMissing} ref(s) without a signature hint (informational)`
    );
  }
  if (report.capturedCount > 0) {
    summary.push(`${report.capturedCount} signature hint(s) captured`);
  }

  const docCount = report.perDiagram.length + report.perJourney.length;
  if (report.totalDrift + report.totalSchemaErrors === 0) {
    const tail = summary.length > 0 ? ` (${summary.join(", ")})` : "";
    console.log(`${ICON_OK} All ${docCount} document(s) clean${tail}.`);
    process.exit(0);
  } else {
    console.log(
      `${ICON_BAD} ${summary.join(", ")} across ${docCount} document(s).`
    );
    process.exit(1);
  }
}
