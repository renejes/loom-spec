import { findLoomRoot } from "../server/findLoomRoot.js";
import { runDriftCheck, type DiagramReport } from "../server/drift.js";

export interface ValidateArgs {
  root: string;
  json: boolean;
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
    default:
      return issue;
  }
}

function printDiagram(d: DiagramReport): void {
  const status =
    d.schemaErrors.length > 0
      ? ICON_BAD
      : d.drift.length > 0
        ? ICON_WARN
        : ICON_OK;
  console.log(`${status} ${d.diagramId}.flow.json — ${d.title}`);
  console.log(
    `  ${d.nodeCount} nodes, ${d.edgeCount} edges, ${d.refsChecked} code refs checked${d.staleNodes > 0 ? `, ${d.staleNodes} stale` : ""}`
  );
  for (const err of d.schemaErrors) {
    console.log(`  ${ICON_BAD} schema: ${err}`);
  }
  for (const f of d.drift) {
    console.log(
      `  ${ICON_BAD} ${f.nodeId} → ${f.ref.path}${f.ref.symbol ? `#${f.ref.symbol}` : ""}: ${formatIssue(f.detail, f.issue)}`
    );
  }
  if (d.schemaErrors.length === 0 && d.drift.length === 0) {
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

  const report = await runDriftCheck(loomRoot.rootPath, loomRoot.loomPath);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.totalDrift + report.totalSchemaErrors > 0 ? 1 : 0);
    return;
  }

  console.log(`loom-spec validate`);
  console.log(`  root: ${loomRoot.rootPath}`);
  console.log();

  for (const d of report.perDiagram) {
    printDiagram(d);
    console.log();
  }

  const summary: string[] = [];
  if (report.totalSchemaErrors > 0) {
    summary.push(`${report.totalSchemaErrors} schema error(s)`);
  }
  if (report.totalDrift > 0) {
    summary.push(`${report.totalDrift} drift finding(s)`);
  }

  if (summary.length === 0) {
    console.log(`${ICON_OK} All ${report.perDiagram.length} diagram(s) clean.`);
    process.exit(0);
  } else {
    console.log(`${ICON_BAD} ${summary.join(", ")} across ${report.perDiagram.length} diagram(s).`);
    process.exit(1);
  }
}
