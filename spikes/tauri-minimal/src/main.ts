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

type VectorSearchHit = {
  entry_id: string;
  source_type: string;
  source_id: string;
  chunk_text: string;
  similarity: number;
};

type VectorSearchReport = {
  database_path: string;
  embedding_model: string;
  query: string;
  entries_written: number;
  before_update_hits: VectorSearchHit[];
  updated_source_id: string;
  updated_chunk_text: string;
  after_update_hits: VectorSearchHit[];
  initial_index_rebuilt: boolean;
};

type OpenAiProviderAdapterReport = {
  provider_name: string;
  text_generation_api: string;
  embedding_api: string;
  api_key_env_var: string;
  api_key_present: boolean;
  request_kind: string;
  model: string;
  context_scope: string[];
  redacted_request_summary: string;
  candidate_status: string;
  response_would_be_candidate: boolean;
  writes_to_fact_store: boolean;
  logs_include_api_key: boolean;
};

type RelationshipPathReport = {
  database_path: string;
  start_entity_id: string;
  target_entity_id: string;
  world_tick: number;
  max_depth: number;
  path_found: boolean;
  hop_count: number;
  entity_path: string[];
  edge_path: string[];
  source_event_ids: string[];
  path_summary: string;
};

type TimeScaleRuleRow = {
  rule_id: string;
  source_domain_id: string;
  target_domain_id: string;
  source_anchor_tick: number;
  target_anchor_tick: number;
  source_tick_span: number;
  target_tick_span: number;
  summary: string;
};

type TimeDomainEventRow = {
  event_id: string;
  title: string;
  time_domain_id: string;
  time_domain_name: string;
  local_tick: number;
  canonical_world_tick: number;
  narrative_order: number;
  affects_current_timeline: boolean;
};

type TimeDomainReport = {
  database_path: string;
  primary_domain_id: string;
  scale_rules: TimeScaleRuleRow[];
  mapped_events: TimeDomainEventRow[];
  query_domain_id: string;
  query_domain_tick: number;
  query_world_tick: number;
  affected_event_ids: string[];
  affected_world_tick_start: number;
  affected_world_tick_end: number;
  narrative_order_separate: boolean;
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

function renderVectorHits(targetId: string, rows: VectorSearchHit[]) {
  const list = byId<HTMLUListElement>(targetId);
  list.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("li");
    item.innerHTML = `
      <strong>${row.source_type}:${row.source_id}</strong>
      <span>${row.chunk_text}</span>
      <code>score=${row.similarity.toFixed(3)}</code>
    `;
    list.appendChild(item);
  }
}

function renderVectorSearchReport(report: VectorSearchReport) {
  byId("vector-entry-count").textContent = String(report.entries_written);
  byId("vector-model").textContent = report.embedding_model;
  byId("vector-query").textContent = report.query;
  byId("vector-updated-source").textContent = report.updated_source_id;
  byId("vector-updated-text").textContent = report.updated_chunk_text;
  byId("database-path").textContent = report.database_path;
  renderVectorHits("vector-before-hits", report.before_update_hits);
  renderVectorHits("vector-after-hits", report.after_update_hits);
}

async function runVectorSearchSpike() {
  const button = byId<HTMLButtonElement>("run-vector-spike");
  const originalText = button.textContent ?? "Run vector search spike";
  button.disabled = true;
  button.textContent = "Indexing...";
  try {
    const report = await invoke<VectorSearchReport>("run_vector_search_spike");
    renderVectorSearchReport(report);
  } catch (error) {
    byId("vector-entry-count").textContent = "0";
    byId("vector-model").textContent = String(error);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderProviderReport(report: OpenAiProviderAdapterReport) {
  byId("provider-name").textContent = report.provider_name;
  byId("provider-api-key").textContent = report.api_key_present
    ? `${report.api_key_env_var}: present`
    : `${report.api_key_env_var}: not configured`;
  byId("provider-request-kind").textContent = report.request_kind;
  byId("provider-model").textContent = report.model;
  byId("provider-text-api").textContent = report.text_generation_api;
  byId("provider-embedding-api").textContent = report.embedding_api;
  byId("provider-context-scope").textContent = report.context_scope.join(", ");
  byId("provider-request-summary").textContent = report.redacted_request_summary;
  byId("provider-candidate-status").textContent = report.candidate_status;
  byId("provider-safety").textContent =
    `candidate=${report.response_would_be_candidate}, writes=${report.writes_to_fact_store}, logs_key=${report.logs_include_api_key}`;
}

async function runProviderAdapterSpike() {
  const button = byId<HTMLButtonElement>("run-provider-spike");
  const originalText = button.textContent ?? "Run provider adapter spike";
  button.disabled = true;
  button.textContent = "Checking...";
  try {
    const report = await invoke<OpenAiProviderAdapterReport>(
      "run_openai_provider_adapter_spike",
    );
    renderProviderReport(report);
  } catch (error) {
    byId("provider-name").textContent = "error";
    byId("provider-request-summary").textContent = String(error);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderRelationshipPathReport(report: RelationshipPathReport) {
  byId("relationship-hop-count").textContent = String(report.hop_count);
  byId("relationship-status").textContent = report.path_found
    ? "path found"
    : "no path";
  byId("relationship-query").textContent =
    `${report.start_entity_id} -> ${report.target_entity_id} @ ${report.world_tick}`;
  byId("relationship-summary").textContent = report.path_summary;
  byId("relationship-entities").textContent = report.entity_path.join(" -> ");
  byId("relationship-edges").textContent = report.edge_path.join(" -> ");
  byId("relationship-sources").textContent = report.source_event_ids.join(", ");
  byId("database-path").textContent = report.database_path;
}

async function runRelationshipPathSpike() {
  const button = byId<HTMLButtonElement>("run-relationship-spike");
  const originalText = button.textContent ?? "Run relationship path spike";
  button.disabled = true;
  button.textContent = "Searching...";
  try {
    const report = await invoke<RelationshipPathReport>(
      "run_relationship_path_spike",
    );
    renderRelationshipPathReport(report);
  } catch (error) {
    byId("relationship-status").textContent = "error";
    byId("relationship-summary").textContent = String(error);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderTimeDomainEvents(targetId: string, rows: TimeDomainEventRow[]) {
  const list = byId<HTMLUListElement>(targetId);
  list.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("li");
    item.innerHTML = `
      <strong>#${row.narrative_order} ${row.title}</strong>
      <span>${row.time_domain_name}:${row.local_tick} -> world_tick=${row.canonical_world_tick}</span>
      <code>${row.affects_current_timeline ? "timeline" : "non-timeline"}</code>
    `;
    list.appendChild(item);
  }
}

function renderTimeDomainReport(report: TimeDomainReport) {
  byId("time-domain-event-count").textContent = String(
    report.mapped_events.length,
  );
  byId("time-domain-status").textContent = report.narrative_order_separate
    ? "narrative order separated"
    : "narrative order aligned";
  byId("time-domain-primary").textContent = report.primary_domain_id;
  byId("time-domain-query").textContent =
    `${report.query_domain_id}:${report.query_domain_tick} -> ${report.query_world_tick}`;
  byId("time-domain-range").textContent =
    `${report.affected_world_tick_start} -> ${report.affected_world_tick_end}`;
  byId("time-domain-affected-events").textContent =
    report.affected_event_ids.join(", ");
  byId("time-domain-rules").textContent = report.scale_rules
    .map((rule) => rule.summary)
    .join(" | ");
  byId("database-path").textContent = report.database_path;
  renderTimeDomainEvents("time-domain-events", report.mapped_events);
}

async function runTimeDomainSpike() {
  const button = byId<HTMLButtonElement>("run-time-domain-spike");
  const originalText = button.textContent ?? "Run time domain spike";
  button.disabled = true;
  button.textContent = "Mapping...";
  try {
    const report = await invoke<TimeDomainReport>("run_time_domain_spike");
    renderTimeDomainReport(report);
  } catch (error) {
    byId("time-domain-status").textContent = "error";
    byId("time-domain-rules").textContent = String(error);
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
  byId<HTMLButtonElement>("run-vector-spike").addEventListener(
    "click",
    runVectorSearchSpike,
  );
  byId<HTMLButtonElement>("run-provider-spike").addEventListener(
    "click",
    runProviderAdapterSpike,
  );
  byId<HTMLButtonElement>("run-relationship-spike").addEventListener(
    "click",
    runRelationshipPathSpike,
  );
  byId<HTMLButtonElement>("run-time-domain-spike").addEventListener(
    "click",
    runTimeDomainSpike,
  );
});
