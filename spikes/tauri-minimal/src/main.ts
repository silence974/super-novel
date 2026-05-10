import { invoke } from "@tauri-apps/api/core";

type ChainRow = {
  subject: string;
  object: string;
  valid_from_tick: number;
  valid_to_tick: number | null;
  source_event_id: string;
};

type NarrativeEvent = {
  title: string;
  world_tick: number;
  narrative_order: number;
  confirmation_status: string;
};

type ConflictResult = {
  severity: string;
  rule_id: string;
  message: string;
  subject_ref: string;
  object_ref: string;
  source_refs: string;
};

type StateGraphSpikeReport = {
  database_path: string;
  database_persistent: boolean;
  project_seeded: boolean;
  sqlite_version: string;
  fts5_available: boolean;
  chapter_count: number;
  location_chain: ChainRow[];
  item_holder_chain: ChainRow[];
  narrative_order: NarrativeEvent[];
  conflicts: ConflictResult[];
  check_results_written: number;
  candidate_facts_ignored_by_checks: number;
};

type IncrementalCheckReport = {
  database_path: string;
  preview_only: boolean;
  changed_fact_id: string;
  patch_description: string;
  affected_entity_ids: string[];
  affected_event_ids: string[];
  affected_chapter_ids: string[];
  affected_fact_ids: string[];
  affected_rule_ids: string[];
  before_conflicts: ConflictResult[];
  after_scope_conflicts: ConflictResult[];
  remaining_global_conflicts: ConflictResult[];
  resolved_conflict_count: number;
};

type SnapshotRestoreReport = {
  database_path: string;
  snapshot_path: string;
  snapshot_size_bytes: number;
  chapter_title_before_damage: string;
  chapter_title_after_damage: string;
  chapter_title_after_restore: string;
  conflicts_before_damage: number;
  conflicts_after_damage: number;
  conflicts_after_restore: number;
  restore_succeeded: boolean;
};

function byId<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

function renderChain(targetId: string, rows: ChainRow[], relation: string) {
  const list = byId<HTMLUListElement>(targetId);
  list.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("li");
    item.innerHTML = `
      <strong>${row.subject}</strong> ${relation} <strong>${row.object}</strong>
      <span>${row.valid_from_tick} -> ${row.valid_to_tick ?? "∞"}</span>
      <code>${row.source_event_id}</code>
    `;
    list.appendChild(item);
  }
}

function renderNarrative(rows: NarrativeEvent[]) {
  const list = byId<HTMLUListElement>("narrative-order");
  list.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("li");
    item.innerHTML = `
      <strong>#${row.narrative_order}</strong> ${row.title}
      <span>world_tick=${row.world_tick}</span>
      <code>${row.confirmation_status}</code>
    `;
    list.appendChild(item);
  }
}

function renderConflicts(targetId: string, rows: ConflictResult[]) {
  const list = byId<HTMLUListElement>(targetId);
  list.innerHTML = "";
  if (rows.length === 0) {
    const item = document.createElement("li");
    item.innerHTML = "<span>无冲突</span>";
    list.appendChild(item);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("li");
    item.className = `severity-${row.severity}`;
    item.innerHTML = `
      <strong>${row.severity.toUpperCase()}</strong>
      <span>${row.message}</span>
      <code>${row.rule_id}</code>
    `;
    list.appendChild(item);
  }
}

function renderReport(report: StateGraphSpikeReport) {
  byId("sqlite-version").textContent = report.sqlite_version;
  byId("fts-status").textContent = report.fts5_available
    ? `FTS5 可用，章节 ${report.chapter_count} 个`
    : "FTS5 不可用";
  byId("conflict-count").textContent = String(report.check_results_written);
  byId("candidate-count").textContent = String(
    report.candidate_facts_ignored_by_checks,
  );
  byId("db-mode").textContent = report.database_persistent ? "本地文件" : "内存";
  byId("seed-status").textContent = report.project_seeded
    ? "本次已写入初始样例数据"
    : "复用已有项目数据库";
  byId("database-path").textContent = report.database_path;
  renderChain("location-chain", report.location_chain, "位于");
  renderChain("item-chain", report.item_holder_chain, "持有者");
  renderNarrative(report.narrative_order);
  renderConflicts("conflicts", report.conflicts);
}

async function runSpike(command: string, buttonId: string) {
  const button = byId<HTMLButtonElement>(buttonId);
  const originalText = button.textContent ?? "运行";
  button.disabled = true;
  button.textContent = "运行中...";
  try {
    const report = await invoke<StateGraphSpikeReport>(command);
    renderReport(report);
  } catch (error) {
    renderConflicts("conflicts", [
      {
        severity: "error",
        rule_id: "spike.runtime",
        message: String(error),
        subject_ref: "",
        object_ref: "",
        source_refs: "",
      },
    ]);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderInlineList(targetId: string, values: string[]) {
  byId(targetId).textContent = values.length > 0 ? values.join(", ") : "无";
}

function renderIncrementalReport(report: IncrementalCheckReport) {
  byId("resolved-count").textContent = String(report.resolved_conflict_count);
  byId("impact-summary").textContent = report.preview_only
    ? "预览模式，未写入补丁"
    : "已应用补丁";
  byId("database-path").textContent = report.database_path;
  byId("db-mode").textContent = "本地文件";
  byId("changed-fact").textContent = report.changed_fact_id;
  byId("patch-description").textContent = report.patch_description;

  renderInlineList("affected-entities", report.affected_entity_ids);
  renderInlineList("affected-events", report.affected_event_ids);
  renderInlineList("affected-chapters", report.affected_chapter_ids);
  renderInlineList("affected-facts", report.affected_fact_ids);
  renderInlineList("affected-rules", report.affected_rule_ids);

  renderConflicts("before-scope-conflicts", report.before_conflicts);
  renderConflicts("after-scope-conflicts", report.after_scope_conflicts);
  renderConflicts("remaining-global-conflicts", report.remaining_global_conflicts);
}

async function runIncrementalSpike() {
  const button = byId<HTMLButtonElement>("run-incremental-spike");
  const originalText = button.textContent ?? "运行增量检查预览";
  button.disabled = true;
  button.textContent = "计算中...";
  try {
    const report = await invoke<IncrementalCheckReport>(
      "run_incremental_check_spike",
    );
    renderIncrementalReport(report);
  } catch (error) {
    renderConflicts("before-scope-conflicts", [
      {
        severity: "error",
        rule_id: "spike.incremental",
        message: String(error),
        subject_ref: "",
        object_ref: "",
        source_refs: "",
      },
    ]);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderSnapshotReport(report: SnapshotRestoreReport) {
  byId("restore-status").textContent = report.restore_succeeded ? "成功" : "失败";
  byId("snapshot-size").textContent = `${report.snapshot_size_bytes} bytes`;
  byId("database-path").textContent = report.database_path;
  byId("snapshot-path").textContent = report.snapshot_path;
  byId("chapter-before-damage").textContent =
    report.chapter_title_before_damage;
  byId("chapter-after-damage").textContent = report.chapter_title_after_damage;
  byId("chapter-after-restore").textContent =
    report.chapter_title_after_restore;
  byId("snapshot-conflicts").textContent =
    `${report.conflicts_before_damage} -> ${report.conflicts_after_damage} -> ${report.conflicts_after_restore}`;
}

async function runSnapshotSpike() {
  const button = byId<HTMLButtonElement>("run-snapshot-spike");
  const originalText = button.textContent ?? "运行快照恢复验证";
  button.disabled = true;
  button.textContent = "验证中...";
  try {
    const report = await invoke<SnapshotRestoreReport>(
      "run_snapshot_restore_spike",
    );
    renderSnapshotReport(report);
  } catch (error) {
    byId("restore-status").textContent = "失败";
    byId("snapshot-size").textContent = String(error);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  byId<HTMLButtonElement>("run-memory-spike").addEventListener("click", () =>
    runSpike("run_state_graph_spike", "run-memory-spike"),
  );
  byId<HTMLButtonElement>("run-project-spike").addEventListener("click", () =>
    runSpike("run_project_database_spike", "run-project-spike"),
  );
  byId<HTMLButtonElement>("run-incremental-spike").addEventListener(
    "click",
    runIncrementalSpike,
  );
  byId<HTMLButtonElement>("run-snapshot-spike").addEventListener(
    "click",
    runSnapshotSpike,
  );
});
