import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

type ViewId =
  | "console"
  | "writer"
  | "outline"
  | "world"
  | "timeline"
  | "conflicts"
  | "aiFacts"
  | "repair"
  | "snapshots";

type ViewMeta = {
  eyebrow: string;
  title: string;
  crumb: string;
};

type NavItem = {
  id: ViewId;
  label: string;
  glyph: string;
  badge?: string;
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

type ChapterRow = {
  depth: string;
  title: string;
  status: "clean" | "error" | "warning" | "notice";
  active?: boolean;
  muted?: boolean;
};

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

const viewMeta: Record<ViewId, ViewMeta> = {
  console: {
    eyebrow: "项目总览",
    title: "作品控制台",
    crumb: "项目总览",
  },
  writer: {
    eyebrow: "第一卷 / 第 07 章",
    title: "抵达黑塔",
    crumb: "第一卷 > 第 07 章 > 抵达黑塔",
  },
  outline: {
    eyebrow: "章节大纲与场景规划",
    title: "第 07 章目标与概览",
    crumb: "第一卷 > 第 07 章 > 场景规划",
  },
  world: {
    eyebrow: "世界观与设定库",
    title: "黑塔防御机制",
    crumb: "世界观与设定库",
  },
  timeline: {
    eyebrow: "事件与时间线",
    title: "双轨时间线视图",
    crumb: "事件与时间线",
  },
  conflicts: {
    eyebrow: "冲突与检查",
    title: "冲突检查结果",
    crumb: "冲突与检查 > 检查结果",
  },
  aiFacts: {
    eyebrow: "AI 帮助",
    title: "AI 候选事实确认",
    crumb: "AI 帮助 > 候选事实确认",
  },
  repair: {
    eyebrow: "AI 帮助",
    title: "修复补丁预览与授权",
    crumb: "AI 帮助 > 修复补丁",
  },
  snapshots: {
    eyebrow: "系统",
    title: "快照、回滚与导出",
    crumb: "系统 > 快照与导出",
  },
};

const navGroups: NavGroup[] = [
  {
    items: [
      { id: "console", label: "作品控制台", glyph: "控" },
      { id: "writer", label: "正文写作工作台", glyph: "写" },
      { id: "outline", label: "章节大纲与场景规划", glyph: "纲" },
      { id: "world", label: "世界观与设定库", glyph: "设" },
      { id: "timeline", label: "事件与时间线", glyph: "事" },
    ],
  },
  {
    label: "冲突与检查",
    items: [{ id: "conflicts", label: "冲突检查结果", glyph: "检", badge: "3" }],
  },
  {
    label: "AI 帮助（需确认）",
    items: [
      { id: "aiFacts", label: "AI 候选事实确认", glyph: "候" },
      { id: "repair", label: "修复补丁预览与授权", glyph: "补" },
    ],
  },
  {
    label: "系统",
    items: [{ id: "snapshots", label: "快照、回滚与导出", glyph: "回" }],
  },
];

const chapterRows: ChapterRow[] = [
  { depth: "第一卷：星尘觉醒", title: "卷结构", status: "clean" },
  { depth: "第 05 章", title: "遗迹守护者", status: "notice", muted: true },
  { depth: "第 06 章", title: "星尘风暴", status: "clean", muted: true },
  { depth: "第 07 章", title: "抵达黑塔", status: "error", active: true },
  { depth: "第 08 章", title: "暗流涌动（草稿）", status: "warning" },
  { depth: "第二卷：深空迷航", title: "15 章", status: "notice", muted: true },
];

let activeView: ViewId = "console";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

function isViewId(value: string): value is ViewId {
  return Object.prototype.hasOwnProperty.call(viewMeta, value);
}

function viewFromHash(): ViewId {
  const hashView = window.location.hash.replace("#", "");
  return isViewId(hashView) ? hashView : "console";
}

function renderNav(active: ViewId) {
  return navGroups
    .map((group) => {
      const label = group.label ? `<p class="nav-group-label">${group.label}</p>` : "";
      const items = group.items
        .map(
          (item) => `
            <button class="nav-item ${item.id === active ? "active" : ""}" type="button" data-view="${item.id}">
              <span class="nav-glyph" aria-hidden="true">${item.glyph}</span>
              <span>${item.label}</span>
              ${item.badge ? `<strong class="nav-badge">${item.badge}</strong>` : ""}
            </button>
          `,
        )
        .join("");

      return `<section class="nav-group">${label}${items}</section>`;
    })
    .join("");
}

function renderTopbar(meta: ViewMeta) {
  return `
    <header class="topbar">
      <div class="topbar-brand">
        <span class="book-mark" aria-hidden="true"></span>
        <strong>《星钥纪事》</strong>
      </div>
      <div class="topbar-crumb">${meta.crumb}</div>
      <div class="topbar-actions" aria-label="全局操作">
        <span class="autosave"><span></span>自动保存已开启 (10:42)</span>
        <button type="button" class="toolbar-button">快照</button>
        <button type="button" class="toolbar-button">导出</button>
        <button type="button" class="primary-check">全局检查</button>
      </div>
    </header>
  `;
}

function renderSidebar(active: ViewId) {
  return `
    <aside class="app-sidebar" aria-label="主导航">
      <div class="workspace-brand">
        <div class="feather-mark" aria-hidden="true">S</div>
        <strong>super-novel</strong>
      </div>
      <nav class="main-nav">${renderNav(active)}</nav>
      <div class="sidebar-user">
        <div class="avatar" aria-hidden="true">作</div>
        <div>
          <strong>本地作者</strong>
          <span>Workspace</span>
        </div>
        <button type="button" aria-label="设置">+</button>
      </div>
    </aside>
  `;
}

function renderChapterRail(mode: "writer" | "outline") {
  const tabs =
    mode === "writer"
      ? `<button class="segmented active" type="button">按卷展示</button><button class="segmented" type="button">最近编辑</button>`
      : `<button class="segmented active" type="button">按卷展示</button><button class="segmented" type="button">状态筛选</button>`;

  return `
    <aside class="chapter-rail" aria-label="章节树">
      <label class="search-box">
        <span aria-hidden="true"></span>
        <input type="search" placeholder="搜索章节..." />
      </label>
      <div class="segmented-row">${tabs}</div>
      <div class="chapter-list">
        ${chapterRows
          .map(
            (row) => `
              <button class="chapter-row ${row.active ? "active" : ""} ${row.muted ? "muted" : ""}" type="button">
                <span>${row.depth}</span>
                <strong>${row.title}</strong>
                <i class="status-dot ${row.status}" aria-hidden="true"></i>
              </button>
            `,
          )
          .join("")}
      </div>
      <button class="add-chapter-button" type="button">+ 新建章节</button>
    </aside>
  `;
}

function renderConsole() {
  return `
    <section class="console-page">
      <header class="page-heading">
        <div>
          <p class="eyebrow">${viewMeta.console.eyebrow}</p>
          <h1>${viewMeta.console.title}</h1>
          <p>当前项目：《星钥纪事》 · 共 3 卷 · 42 章 · 约 12.5 万字</p>
        </div>
        <div class="heading-actions">
          <button class="toolbar-button strong" type="button">快速导出 MD</button>
          <button class="blue-button" type="button" data-view="writer">继续写作</button>
        </div>
      </header>

      <section class="metric-grid" aria-label="作品统计">
        ${renderMetric("42", "总章节数", "blue")}
        ${renderMetric("3", "致命冲突 (Error)", "red")}
        ${renderMetric("12", "逻辑警告 (Warning)", "amber")}
        ${renderMetric("28", "设定提示 (Notice)", "slate")}
      </section>

      <section class="console-layout">
        <article class="panel recent-panel">
          <div class="panel-title">
            <h2>最近编辑章节</h2>
            <button class="text-link" type="button">查看全部树结构</button>
          </div>
          ${renderRecentChapter("第一卷 / 第 07 章 / 抵达黑塔", "3,240 字 · 10 分钟前编辑", "× 1", "! 2")}
          ${renderRecentChapter("第一卷 / 第 06 章 / 星尘风暴", "4,102 字 · 昨天 14:30 编辑", "无冲突", "")}
          ${renderRecentChapter("第一卷 / 第 05 章 / 遗迹守护者", "2,890 字 · 3 天前编辑", "1", "")}
          <div class="pager">‹ <span>1 / 5</span> ›</div>
        </article>

        <aside class="panel ai-card-stack">
          <div class="panel-title">
            <h2>常用 AI 辅助（手动触发）</h2>
          </div>
          ${renderActionCard("抽取当前章节候选事实", "扫描正文，提取新设定、角色状态变化供确认入库。")}
          ${renderActionCard("生成全局修复补丁", "针对当前 3 个 Error，生成可预览的修复建议。")}
          ${renderActionCard("局部段落润色", "选中编辑器段落后可用，提供多种风格重写建议。")}
        </aside>

        <article class="panel chart-panel">
          <div class="panel-title">
            <h2>字数增长趋势（最近30天）</h2>
            <span class="legend"><i></i>新增字数</span>
          </div>
          <div class="line-chart" aria-label="字数增长折线图">
            <div class="chart-fill"></div>
            <div class="chart-line"></div>
            <span>0</span><span>50k</span><span>100k</span>
          </div>
        </article>

        <aside class="panel snapshot-stack">
          <div class="panel-title">
            <h2>最近快照</h2>
            <button class="text-link" type="button">管理快照</button>
          </div>
          <ol class="snapshot-list">
            <li><strong>v1.2.4 - 完成第七章初稿</strong><span>今天 10:30 · 手动创建</span></li>
            <li><strong>Auto-Save 节点</strong><span>昨天 23:00 · 系统自动</span></li>
            <li><strong>v1.2.3 - 修正时间线冲突</strong><span>3天前 · 包含补丁应用</span></li>
          </ol>
        </aside>

        <aside class="panel conflict-alert">
          <h2>待处理冲突摘要</h2>
          <div class="alert-box">
            <strong>位置逻辑冲突 (Error)</strong>
            <p>角色“艾琳”在第07章出现于黑塔，但根据时间线记录，她此刻应在星港。</p>
          </div>
        </aside>
      </section>
    </section>
  `;
}

function renderMetric(value: string, label: string, tone: string) {
  return `
    <article class="metric-card">
      <span class="metric-icon ${tone}" aria-hidden="true"></span>
      <div>
        <strong>${value}</strong>
        <span>${label}</span>
      </div>
    </article>
  `;
}

function renderRecentChapter(title: string, meta: string, firstBadge: string, secondBadge: string) {
  const good = firstBadge === "无冲突";
  return `
    <div class="recent-row">
      <span class="doc-icon" aria-hidden="true"></span>
      <div>
        <strong>${title}</strong>
        <p>${meta}</p>
      </div>
      <div class="row-badges">
        ${firstBadge ? `<span class="${good ? "ok-badge" : "error-badge"}">${firstBadge}</span>` : ""}
        ${secondBadge ? `<span class="warning-badge">${secondBadge}</span>` : ""}
        <button type="button" aria-label="更多">⋮</button>
      </div>
    </div>
  `;
}

function renderActionCard(title: string, body: string) {
  return `
    <button class="action-card" type="button">
      <span aria-hidden="true"></span>
      <div>
        <strong>${title}</strong>
        <small>${body}</small>
      </div>
    </button>
  `;
}

function renderWriter() {
  return `
    <section class="workbench-grid writer-grid">
      ${renderChapterRail("writer")}
      <main class="editor-surface">
        <div class="floating-toolbar" aria-label="正文格式工具">
          <button type="button">B</button>
          <button type="button"><i>I</i></button>
          <button type="button">U</button>
          <span></span>
          <button type="button">≡</button>
          <button type="button">”</button>
          <button type="button">↗</button>
        </div>
        <article class="chapter-document">
          <h1>抵达黑塔</h1>
          <p class="document-meta">字数：3,240　预计阅读：10 分钟</p>
          <p>飞船的引擎发出低沉的复鸣，穿透了隔音舱壁，在艾琳的骨骼中引起轻微的共振。全息舷窗外，那座被称为“黑塔”的巨大结构终于从星云的迷雾中显露出了真容。</p>
          <p>它并不像名字暗示的那样是一座传统的塔形建筑，而是一个由无数几何晶体拼接而成的庞大星际堡垒，表面流转着幽暗的紫光。</p>
          <p class="annotated error"><span></span>艾琳检查了一下腰间的装备带，确认所有必需品都在原位。她站起身，走向气闸舱，准备迎接即将到来的对接。黑塔的引力场异常强大，飞船的自动导航系统不得不频繁修正轨道。</p>
          <p>“指挥官，我们收到了来自黑塔的通讯请求。”通讯官雷诺的声音从舰桥传来，带着一丝不易察觉的紧张。</p>
          <p class="annotated warning"><span></span>“接通。”艾琳深吸了一口气，手不自觉地握紧了口袋里的星能密钥。屏幕闪烁了一下，一个模糊的光影轮廓出现在主控台上。</p>
          <p>“外来者，你们已经进入禁区。”光影发出的声音并非通过空气传播，而是直接在他们的脑海中响起，冰冷而机械。</p>
        </article>
      </main>
      <aside class="context-rail">
        <div class="context-top">
          <h2>上下文参考</h2>
          <button type="button" aria-label="更多">•••</button>
        </div>
        <section class="context-section">
          <h3>本章出场角色</h3>
          <div class="reference-card">
            <strong>艾琳（主角）</strong>
            <small>状态：紧张、专注。目标：进入黑塔寻找深渊之眼。</small>
            <button type="button">查看设定</button>
          </div>
          <div class="reference-card">
            <strong>雷诺（通讯官）</strong>
            <button type="button">查看设定</button>
          </div>
        </section>
        <section class="context-section">
          <h3>地点 & 道具</h3>
          <div class="tag-row">
            <span>黑塔（遗迹）</span>
            <span class="warn">星能密钥</span>
            <span>深渊之眼</span>
          </div>
        </section>
        <section class="ai-dock">
          <h3>AI 辅助面板</h3>
          ${renderActionCard("抽取候选事实", "从当前章节提取新设定供入库确认")}
          ${renderActionCard("基于当前章检查冲突", "运行逻辑引擎，验证时间线与状态")}
        </section>
      </aside>
    </section>
  `;
}

function renderOutline() {
  return `
    <section class="workbench-grid outline-grid">
      ${renderChapterRail("outline")}
      <main class="outline-main">
        <article class="panel goal-card">
          <div class="panel-title">
            <h2>第 07 章目标与概览</h2>
            <button class="text-link" type="button">编辑</button>
          </div>
          <div class="goal-layout">
            <div>
              <h3>本章目的</h3>
              <p>主角团队正式接触古代星灵设施，揭示“深渊之眼”的初步线索，建立遗迹的高危基调。</p>
            </div>
            <div>
              <h3>推进点</h3>
              <ul>
                <li>艾琳使用星能密钥通过初级验证</li>
                <li>引发黑塔防御机制的异常反应</li>
              </ul>
            </div>
            <div class="mini-bars" aria-label="关键冲突与情绪曲线">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>
          <div class="foreshadow">
            <strong>伏笔 / 回收</strong>
            <p>第03章提及的“机械回音”传说在此处得到证实。</p>
          </div>
        </article>

        <section class="scene-board">
          <article class="panel scene-list-panel">
            <div class="panel-title">
              <h2>场景列表</h2>
              <button class="toolbar-button" type="button">+ 添加场景</button>
            </div>
            <div class="scene-table">
              ${renderSceneRow("S01", "飞船舰桥", "星历442年 14:00", "艾琳", "~500字", "已完成")}
              ${renderSceneRow("S02", "黑塔外部引力场", "星历442年 14:18", "艾琳", "~1200字", "撰写中", true)}
              ${renderSceneRow("S03", "对接通道", "星历442年 14:32", "雷诺", "~800字", "待写")}
            </div>
            <p class="hint-line">提示：拖拽可调整叙事顺序，不影响设定的世界内时间。</p>
          </article>

          <article class="panel scene-detail-panel">
            <div class="scene-detail-header">
              <span>S02</span>
              <h2>场景详情</h2>
            </div>
            <h3>场景摘要</h3>
            <p class="summary-box">飞船接近黑塔，收到古代星灵协议的通讯。艾琳使用星能密钥通过初级验证。</p>
            <h3>出场角色</h3>
            <div class="chip-row"><span>艾琳 ×</span><span>雷诺 ×</span><button type="button">+ 添加角色</button></div>
            <h3>叙事节拍</h3>
            <div class="beat-list">
              <p><strong>开端</strong> 视觉描写：黑塔的宏大与幽暗紫光。</p>
              <p><strong>转折</strong> 飞船内部的共振感。</p>
            </div>
          </article>
        </section>
      </main>

      <aside class="context-rail">
        <div class="context-top"><h2>当前场景绑定 (S02)</h2><button type="button">↗</button></div>
        <section class="context-section">
          <h3>关联事件</h3>
          <div class="reference-card confirmed"><strong>初次接触黑塔</strong><small>星历442.14:15 · 本章</small></div>
        </section>
        <section class="context-section">
          <h3>设定引用（事实源）</h3>
          <div class="reference-card"><strong>黑塔防御机制</strong><small>古代星灵遗留的自动化防御系统。</small></div>
          <div class="reference-card warn"><strong>星能密钥</strong><small>状态异常：当前记录显示密钥在雷诺手中。</small></div>
        </section>
        <section class="ai-dock">
          <h3>手动 AI 操作</h3>
          ${renderActionCard("生成备选场景节拍", "根据章节目标，提供不同的发展与转折方案")}
          ${renderActionCard("检查场景与设定一致性", "验证出场角色、道具状态是否符合世界观")}
          ${renderActionCard("扩写场景大纲", "将当前摘要丰富为更详细的动作指导")}
        </section>
      </aside>
    </section>
  `;
}

function renderSceneRow(
  code: string,
  place: string,
  time: string,
  pov: string,
  length: string,
  status: string,
  active = false,
) {
  return `
    <div class="scene-row ${active ? "active" : ""}">
      <span class="drag-handle">::</span>
      <strong>${code}</strong>
      <div><b>${place}</b><small>${time}</small></div>
      <span>${pov}</span>
      <span>${length}</span>
      <em>${status}</em>
    </div>
  `;
}

function renderWorld() {
  return `
    <section class="workbench-grid world-grid">
      <aside class="category-rail">
        <div class="rail-title"><h2>设定分类</h2><button type="button">+</button></div>
        <label class="search-box"><span></span><input type="search" placeholder="搜索分类..." /></label>
        ${renderCategory("世界规则", "12", true)}
        ${renderCategory("地理", "8")}
        ${renderCategory("组织势力", "5")}
        ${renderCategory("角色", "24")}
        ${renderCategory("道具", "15")}
        ${renderCategory("术式", "9")}
        ${renderCategory("名词表", "42")}
        <button class="switch-structure" type="button">切换至作品结构</button>
      </aside>

      <main class="settings-list panel">
        <div class="panel-title">
          <h2>世界规则</h2>
          <button class="blue-button" type="button">+ 新建设定</button>
        </div>
        <label class="search-box"><span></span><input type="search" placeholder="搜索设定..." /></label>
        <div class="settings-table">
          ${renderSettingRow("星能共振原理", "基础理论", "已确认", "2天前")}
          ${renderSettingRow("黑塔防御机制", "古代遗迹", "已确认", "10:42", true)}
          ${renderSettingRow("深渊之眼效应", "高危", "待核对", "1周前")}
          ${renderSettingRow("引力折叠跃迁", "航行", "草稿", "1月前")}
        </div>
      </main>

      <article class="setting-detail panel">
        <div class="detail-heading">
          <h1>黑塔防御机制</h1>
          <span class="confirmed-pill">已确认</span>
          <button type="button">历史版本</button>
          <button type="button">编辑</button>
        </div>
        <section>
          <h3>定义</h3>
          <p class="definition-box">古代星灵遗留的自动化防御系统。当检测到未授权的能量波动（如非星灵来源的引擎震荡、武器充能）时，会产生定向引力捕获反应，将目标强行拖入塔内隔离区。</p>
        </section>
        <div class="condition-grid">
          <section>
            <h3>约束条件</h3>
            <ul><li>需要星能密钥才能解除警报。</li><li>引力捕获无法被常规物理护盾抵抗。</li></ul>
          </section>
          <section>
            <h3>边界条件</h3>
            <ul><li>作用范围仅限黑塔外部 5000 公里内。</li><li>对纯生物体不生效。</li></ul>
          </section>
        </div>
        <section class="evidence-table">
          <h3>元数据与证据</h3>
          <div><span>首次出现章节</span><strong>第一卷 / 第 03 章 / 机械回音</strong></div>
          <div><span>证据引用（正文）</span><p>“老走私客喝了一口劣质合成酒，含糊不清地嘟囔着：别靠近那座黑塔，它有眼睛...”</p></div>
        </section>
        <div class="detail-actions">
          <button type="button">引用到正文</button>
          <button type="button">绑定到事件</button>
          <button type="button">添加约束规则</button>
        </div>
      </article>

      <aside class="context-rail">
        <div class="context-top"><h2>关联实体与冲突摘要</h2><button type="button">⌄</button></div>
        <section class="context-section">
          <h3>冲突检测（黑塔防御机制）</h3>
          <div class="alert-box">
            <strong>高级冲突</strong>
            <p>场景 S02 中，艾琳使用了星能密钥，但设定记录该密钥目前应在雷诺手中。</p>
          </div>
        </section>
        <section class="context-section">
          <h3>关联章节 (3)</h3>
          <div class="link-list"><span>第 03 章 / 机械回音</span><span>第 07 章 / 抵达黑塔</span><span>第 12 章 / 逃离</span></div>
        </section>
        <section class="context-section">
          <h3>关联角色 (2)</h3>
          <div class="chip-row"><span>艾琳</span><span>雷诺</span></div>
        </section>
        <section class="ai-dock">
          <h3>AI 事实提取</h3>
          <p>从当前正文或大纲中提取潜在的新设定或更新现有设定。提取结果需经手动确认后才会入库。</p>
          <button class="blue-outline" type="button">手动触发提取</button>
        </section>
      </aside>
    </section>
  `;
}

function renderCategory(name: string, count: string, active = false) {
  return `
    <button class="category-row ${active ? "active" : ""}" type="button">
      <span>${name}</span><strong>${count}</strong>
    </button>
  `;
}

function renderSettingRow(name: string, tag: string, status: string, updated: string, active = false) {
  return `
    <button class="setting-row ${active ? "active" : ""}" type="button">
      <strong>${name}</strong>
      <span>${tag}</span>
      <em>${status}</em>
      <small>${updated}</small>
    </button>
  `;
}

function renderTimeline() {
  return `
    <section class="workbench-grid timeline-grid">
      <aside class="timeline-filters">
        <section class="filter-section">
          <h2>视图控制</h2>
          <label class="range-label"><span>缩放级别</span><input type="range" min="1" max="10" value="6" /></label>
        </section>
        <section class="filter-section">
          <h3>角色出场</h3>
          ${renderCheck("艾琳", "12", true)}
          ${renderCheck("雷诺", "8", true)}
          ${renderCheck("塞拉斯", "3", false)}
        </section>
        <section class="filter-section">
          <h3>发生地点</h3>
          ${renderCheck("黑塔内部", "", true)}
          ${renderCheck("边缘星域", "", false)}
        </section>
        <section class="filter-section">
          <h3>事件类型</h3>
          ${renderCheck("关键剧情", "", true, "red")}
          ${renderCheck("背景设定", "", true, "blue")}
        </section>
        <button class="blue-button full" type="button">+ 新建独立事件</button>
      </aside>

      <main class="timeline-main">
        <header class="timeline-header">
          <div>
            <p class="eyebrow">双轨时间线视图</p>
            <h1>双轨时间线视图</h1>
          </div>
          <div class="segmented-row">
            <button class="segmented active" type="button">关联视图</button>
            <button class="segmented" type="button">状态轨迹</button>
          </div>
          <strong>第一卷（叙事）/ 星元 3042 年（世界）</strong>
        </header>
        <section class="timeline-canvas" aria-label="时间线画布">
          <div class="track-label top">叙事顺序</div>
          <div class="event-card small"><span>第一卷 / 第01章</span><strong>边缘相遇</strong><i></i><i class="amber"></i></div>
          <div class="event-card active"><span>第一卷 / 第02章（当前）</span><strong>黑塔现世</strong><i></i><i class="red"></i></div>
          <div class="event-card right"><span>第一卷 / 第03章</span><strong>往日幽影</strong><i></i></div>
          <div class="dashed-line one"></div>
          <div class="dashed-line two"></div>
          <div class="track-label bottom">世界内时间</div>
          <div class="world-axis">
            <span>雷诺持有<br />3038.05</span>
            <span>遗失于废墟<br />3040.12</span>
            <span class="blue">艾琳获取<br />3042.11</span>
          </div>
        </section>
        <section class="state-track">
          <strong>状态轨迹：道具持有流转</strong>
          <select aria-label="道具选择"><option>星能密钥</option></select>
        </section>
      </main>

      <aside class="context-rail">
        <div class="context-top"><h2>事件详情</h2><button type="button">编辑</button></div>
        <section class="context-section event-detail">
          <span class="plot-tag">关键剧情</span><small>3042.11.03</small>
          <h1>艾琳获取星能密钥</h1>
          <p>在废墟深处，艾琳意外触发了古代机关，找到了丢失多年的星能密钥。</p>
        </section>
        <section class="context-section">
          <h3>参与角色</h3>
          <div class="chip-row"><span>艾琳</span></div>
          <h3>发生地点</h3>
          <div class="chip-row"><span>黑塔外部废墟</span></div>
          <h3>涉及道具</h3>
          <div class="chip-row"><span>星能密钥</span></div>
        </section>
        <section class="context-section">
          <h3>潜在冲突提示</h3>
          <div class="alert-box">
            <strong>时间线逻辑冲突</strong>
            <p>设定库记录：星能密钥在 3042.11.03 时应处于“黑塔核心区”的封印状态。</p>
          </div>
        </section>
        <section class="ai-dock">
          <h3>手动 AI 操作</h3>
          ${renderActionCard("生成事件摘要", "整理事件涉及的角色、地点和状态变化")}
          ${renderActionCard("检查状态一致性", "验证角色位置、道具持有和关系路径")}
        </section>
      </aside>
    </section>
  `;
}

function renderCheck(label: string, count: string, checked: boolean, tone = "neutral") {
  return `
    <label class="check-row ${tone}">
      <input type="checkbox" ${checked ? "checked" : ""} />
      <span>${label}</span>
      ${count ? `<strong>${count}</strong>` : ""}
    </label>
  `;
}

function renderSupportView(kind: ViewId) {
  const meta = viewMeta[kind];
  const panels: Record<ViewId, string> = {
    console: "",
    writer: "",
    outline: "",
    world: "",
    timeline: "",
    conflicts: `
      <article class="panel">
        <h2>当前冲突</h2>
        <div class="alert-list">
          <div class="alert-box"><strong>位置逻辑冲突</strong><p>艾琳在同一时间段被标记在黑塔与星港。</p></div>
          <div class="alert-box warning"><strong>道具归属待确认</strong><p>星能密钥的持有者需要人工确认。</p></div>
          <div class="alert-box notice"><strong>设定提示</strong><p>黑塔防御机制缺少边界条件。</p></div>
        </div>
      </article>
    `,
    aiFacts: `
      <article class="panel">
        <h2>候选事实队列</h2>
        <div class="candidate-list">
          <label><input type="checkbox" /> 艾琳使用星能密钥通过黑塔初级验证。</label>
          <label><input type="checkbox" /> 黑塔防御机制会捕获未授权能量波动。</label>
          <label><input type="checkbox" /> 雷诺在 S02 场景中发起通讯协议。</label>
        </div>
      </article>
    `,
    repair: `
      <article class="panel">
        <h2>修复补丁预览</h2>
        <div class="patch-preview">
          <div><strong>正文修改授权</strong><p>将“她始终持有星能密钥”改为“她接过雷诺递来的星能密钥”。</p></div>
          <div><strong>事件修改授权</strong><p>新增“雷诺交付星能密钥”事件，世界时间 3042.11.03。</p></div>
          <div><strong>状态修改授权</strong><p>预览道具持有链变更，不自动写入。</p></div>
        </div>
      </article>
    `,
    snapshots: `
      <article class="panel">
        <h2>快照与导出</h2>
        <div class="snapshot-tools">
          <button class="blue-button" type="button">创建手动快照</button>
          <button class="toolbar-button" type="button">恢复到所选快照</button>
          <button class="toolbar-button" type="button">导出 Markdown</button>
        </div>
      </article>
    `,
  };

  return `
    <section class="support-page">
      <header class="page-heading">
        <div>
          <p class="eyebrow">${meta.eyebrow}</p>
          <h1>${meta.title}</h1>
          <p>该区域延续设计稿的信息密度与人工确认原则，作为后续功能实现的占位工作台。</p>
        </div>
      </header>
      ${panels[kind]}
    </section>
  `;
}

function renderView(view: ViewId) {
  switch (view) {
    case "console":
      return renderConsole();
    case "writer":
      return renderWriter();
    case "outline":
      return renderOutline();
    case "world":
      return renderWorld();
    case "timeline":
      return renderTimeline();
    case "conflicts":
    case "aiFacts":
    case "repair":
    case "snapshots":
      return renderSupportView(view);
  }
}

function renderDiagnostics() {
  return `
    <section class="diagnostics-drawer" aria-label="技术验证结果">
      <details>
        <summary>技术验证结果与数据库状态</summary>
        <div class="lab-actions">
          <button id="run-memory-spike" type="button" data-lab="memory">内存图谱</button>
          <button id="run-project-spike" type="button" data-lab="project">项目数据库</button>
          <button id="run-incremental-spike" type="button" data-lab="incremental">增量检查</button>
          <button id="run-snapshot-spike" type="button" data-lab="snapshot">快照恢复</button>
          <button id="run-vector-spike" type="button" data-lab="vector">向量检索</button>
          <button id="run-provider-spike" type="button" data-lab="provider">Provider 边界</button>
          <button id="run-relationship-spike" type="button" data-lab="relationship">关系路径</button>
          <button id="run-time-domain-spike" type="button" data-lab="timeDomain">时间域映射</button>
        </div>

        <section class="diagnostic-grid">
          ${renderDiagnosticCard("SQLite", "sqlite-version", "Not run", "fts-status", "FTS5 pending")}
          ${renderDiagnosticCard("Conflicts", "conflict-count", "0", "", "error / warning / notice checks")}
          ${renderDiagnosticCard("Candidate Facts", "candidate-count", "0", "", "candidate data stays out of confirmed checks")}
          ${renderDiagnosticCard("Project DB", "db-mode", "Not run", "seed-status", "No project database opened yet")}
          ${renderDiagnosticCard("Incremental Check", "resolved-count", "0", "impact-summary", "No impact scope calculated yet")}
          ${renderDiagnosticCard("Snapshot Restore", "restore-status", "Not run", "snapshot-size", "No snapshot created yet")}
          ${renderDiagnosticCard("Vector Index", "vector-entry-count", "0", "vector-model", "Not indexed")}
          ${renderDiagnosticCard("AI Provider", "provider-name", "Not run", "provider-api-key", "No provider checked")}
          ${renderDiagnosticCard("Relation Path", "relationship-hop-count", "0", "relationship-status", "Not searched")}
          ${renderDiagnosticCard("Time Domains", "time-domain-event-count", "0", "time-domain-status", "Not mapped")}
        </section>

        <section class="diagnostic-panel">
          <span class="label">Database Path</span>
          <code id="database-path">Not run</code>
        </section>

        <section class="diagnostic-panel">
          <div class="panel-title">
            <div>
              <span class="label">Incremental Check Preview</span>
              <h2>Impact scope and patch preview</h2>
            </div>
            <code id="changed-fact">Not run</code>
          </div>
          <p id="patch-description">No incremental check preview generated yet.</p>
          <div class="scope-grid">
            ${renderScope("Entities", "affected-entities")}
            ${renderScope("Events", "affected-events")}
            ${renderScope("Chapters", "affected-chapters")}
            ${renderScope("Facts", "affected-facts")}
            ${renderScope("Rules", "affected-rules")}
          </div>
        </section>

        <section class="diagnostic-panel">
          <div class="panel-title">
            <div>
              <span class="label">Snapshot Restore</span>
              <h2>Project snapshot and rollback</h2>
            </div>
            <code id="snapshot-path">Not run</code>
          </div>
          <div class="scope-grid">
            ${renderScope("Before damage", "chapter-before-damage")}
            ${renderScope("After damage", "chapter-after-damage")}
            ${renderScope("After restore", "chapter-after-restore")}
            ${renderScope("Conflict counts", "snapshot-conflicts")}
          </div>
        </section>

        <section class="diagnostic-panel">
          <div class="panel-title">
            <div>
              <span class="label">Vector Search</span>
              <h2>Derived semantic index write, update, query</h2>
            </div>
            <code id="vector-query">Not run</code>
          </div>
          <div class="scope-grid">
            ${renderScope("Updated source", "vector-updated-source")}
            ${renderScope("Updated text", "vector-updated-text")}
          </div>
        </section>

        <section class="diagnostic-panel">
          <div class="panel-title">
            <div>
              <span class="label">OpenAI Provider Adapter</span>
              <h2>Request boundary and candidate response contract</h2>
            </div>
            <code id="provider-request-kind">Not run</code>
          </div>
          <div class="scope-grid">
            ${renderScope("Model", "provider-model")}
            ${renderScope("Text API", "provider-text-api")}
            ${renderScope("Embedding API", "provider-embedding-api")}
            ${renderScope("Candidate status", "provider-candidate-status")}
            ${renderScope("Safety flags", "provider-safety")}
          </div>
          <p id="provider-request-summary">No provider request draft generated yet.</p>
          <code id="provider-context-scope">No context scope</code>
        </section>

        <section class="diagnostic-panel">
          <div class="panel-title">
            <div>
              <span class="label">Relationship Path</span>
              <h2>Recursive graph query over confirmed edges</h2>
            </div>
            <code id="relationship-query">Not run</code>
          </div>
          <p id="relationship-summary">No relationship path searched yet.</p>
          <div class="scope-grid">
            ${renderScope("Entities", "relationship-entities")}
            ${renderScope("Edges", "relationship-edges")}
            ${renderScope("Source events", "relationship-sources")}
          </div>
        </section>

        <section class="diagnostic-panel">
          <div class="panel-title">
            <div>
              <span class="label">Time Domain Mapping</span>
              <h2>Local domain ticks mapped to canonical world time</h2>
            </div>
            <code id="time-domain-query">Not run</code>
          </div>
          <p id="time-domain-rules">No time scale rules mapped yet.</p>
          <div class="scope-grid">
            ${renderScope("Primary domain", "time-domain-primary")}
            ${renderScope("Affected world ticks", "time-domain-range")}
            ${renderScope("Affected events", "time-domain-affected-events")}
          </div>
        </section>

        <section class="diagnostic-lists">
          ${renderListPanel("Location Chain", "location-chain")}
          ${renderListPanel("Item Holder Chain", "item-chain")}
          ${renderListPanel("Narrative Order", "narrative-order")}
          ${renderListPanel("Conflicts", "conflicts")}
          ${renderListPanel("Before Incremental Repair", "before-scope-conflicts")}
          ${renderListPanel("After Incremental Repair", "after-scope-conflicts")}
          ${renderListPanel("Remaining Global Conflicts", "remaining-global-conflicts")}
          ${renderListPanel("Vector Hits Before Update", "vector-before-hits")}
          ${renderListPanel("Vector Hits After Update", "vector-after-hits")}
          ${renderListPanel("Time Domain Events", "time-domain-events")}
        </section>
      </details>
    </section>
  `;
}

function renderDiagnosticCard(
  label: string,
  strongId: string,
  strongText: string,
  smallId: string,
  smallText: string,
) {
  return `
    <article class="diagnostic-card">
      <span class="label">${label}</span>
      <strong id="${strongId}">${strongText}</strong>
      <small ${smallId ? `id="${smallId}"` : ""}>${smallText}</small>
    </article>
  `;
}

function renderScope(label: string, id: string) {
  return `<div><span>${label}</span><code id="${id}">None</code></div>`;
}

function renderListPanel(title: string, id: string) {
  return `<article><h2>${title}</h2><ul id="${id}"></ul></article>`;
}

function renderStatusbar() {
  return `
    <footer class="statusbar">
      <span><i class="status-online"></i>DB: Connected</span>
      <span>最近保存: 10:42</span>
      <span>检查引擎: 发现 1 Error, 1 Warning</span>
      <span>快照: v1.2.4</span>
      <span>API: 已配置</span>
    </footer>
  `;
}

function renderApp() {
  const meta = viewMeta[activeView];
  return `
    <div class="app-shell">
      ${renderTopbar(meta)}
      ${renderSidebar(activeView)}
      <main class="view-host">${renderView(activeView)}</main>
      ${renderDiagnostics()}
      ${renderStatusbar()}
    </div>
  `;
}

function render() {
  byId<HTMLDivElement>("app").innerHTML = renderApp();
}

function setActiveView(view: ViewId) {
  activeView = view;
  if (window.location.hash !== `#${view}`) {
    history.replaceState(null, "", `#${view}`);
  }
  render();
}

function renderChain(targetId: string, rows: ChainRow[], relation: string) {
  const list = byId<HTMLUListElement>(targetId);
  list.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("li");
    item.innerHTML = `
      <strong>${row.subject}</strong> ${relation} <strong>${row.object}</strong>
      <span>${row.valid_from_tick} -> ${row.valid_to_tick ?? "未结束"}</span>
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

function renderConflictRows(targetId: string, rows: ConflictResult[]) {
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
  byId("candidate-count").textContent = String(report.candidate_facts_ignored_by_checks);
  byId("db-mode").textContent = report.database_persistent ? "本地文件" : "内存";
  byId("seed-status").textContent = report.project_seeded
    ? "本次已写入初始样例数据"
    : "复用已有项目数据库";
  byId("database-path").textContent = report.database_path;
  renderChain("location-chain", report.location_chain, "位于");
  renderChain("item-chain", report.item_holder_chain, "持有者");
  renderNarrative(report.narrative_order);
  renderConflictRows("conflicts", report.conflicts);
}

async function withBusy(button: HTMLButtonElement, busyText: string, task: () => Promise<void>) {
  const originalText = button.textContent ?? "运行";
  button.disabled = true;
  button.textContent = busyText;
  try {
    await task();
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function runSpike(command: string, button: HTMLButtonElement) {
  await withBusy(button, "运行中...", async () => {
    try {
      const report = await invoke<StateGraphSpikeReport>(command);
      renderReport(report);
    } catch (error) {
      renderConflictRows("conflicts", [
        {
          severity: "error",
          rule_id: "spike.runtime",
          message: String(error),
          subject_ref: "",
          object_ref: "",
          source_refs: "",
        },
      ]);
    }
  });
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

  renderConflictRows("before-scope-conflicts", report.before_conflicts);
  renderConflictRows("after-scope-conflicts", report.after_scope_conflicts);
  renderConflictRows("remaining-global-conflicts", report.remaining_global_conflicts);
}

async function runIncrementalSpike(button: HTMLButtonElement) {
  await withBusy(button, "计算中...", async () => {
    try {
      const report = await invoke<IncrementalCheckReport>("run_incremental_check_spike");
      renderIncrementalReport(report);
    } catch (error) {
      renderConflictRows("before-scope-conflicts", [
        {
          severity: "error",
          rule_id: "spike.incremental",
          message: String(error),
          subject_ref: "",
          object_ref: "",
          source_refs: "",
        },
      ]);
    }
  });
}

function renderSnapshotReport(report: SnapshotRestoreReport) {
  byId("restore-status").textContent = report.restore_succeeded ? "成功" : "失败";
  byId("snapshot-size").textContent = `${report.snapshot_size_bytes} bytes`;
  byId("database-path").textContent = report.database_path;
  byId("snapshot-path").textContent = report.snapshot_path;
  byId("chapter-before-damage").textContent = report.chapter_title_before_damage;
  byId("chapter-after-damage").textContent = report.chapter_title_after_damage;
  byId("chapter-after-restore").textContent = report.chapter_title_after_restore;
  byId("snapshot-conflicts").textContent =
    `${report.conflicts_before_damage} -> ${report.conflicts_after_damage} -> ${report.conflicts_after_restore}`;
}

async function runSnapshotSpike(button: HTMLButtonElement) {
  await withBusy(button, "验证中...", async () => {
    try {
      const report = await invoke<SnapshotRestoreReport>("run_snapshot_restore_spike");
      renderSnapshotReport(report);
    } catch (error) {
      byId("restore-status").textContent = "失败";
      byId("snapshot-size").textContent = String(error);
    }
  });
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

async function runVectorSearchSpike(button: HTMLButtonElement) {
  await withBusy(button, "Indexing...", async () => {
    try {
      const report = await invoke<VectorSearchReport>("run_vector_search_spike");
      renderVectorSearchReport(report);
    } catch (error) {
      byId("vector-entry-count").textContent = "0";
      byId("vector-model").textContent = String(error);
    }
  });
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

async function runProviderAdapterSpike(button: HTMLButtonElement) {
  await withBusy(button, "Checking...", async () => {
    try {
      const report = await invoke<OpenAiProviderAdapterReport>(
        "run_openai_provider_adapter_spike",
      );
      renderProviderReport(report);
    } catch (error) {
      byId("provider-name").textContent = "error";
      byId("provider-request-summary").textContent = String(error);
    }
  });
}

function renderRelationshipPathReport(report: RelationshipPathReport) {
  byId("relationship-hop-count").textContent = String(report.hop_count);
  byId("relationship-status").textContent = report.path_found ? "path found" : "no path";
  byId("relationship-query").textContent =
    `${report.start_entity_id} -> ${report.target_entity_id} @ ${report.world_tick}`;
  byId("relationship-summary").textContent = report.path_summary;
  byId("relationship-entities").textContent = report.entity_path.join(" -> ");
  byId("relationship-edges").textContent = report.edge_path.join(" -> ");
  byId("relationship-sources").textContent = report.source_event_ids.join(", ");
  byId("database-path").textContent = report.database_path;
}

async function runRelationshipPathSpike(button: HTMLButtonElement) {
  await withBusy(button, "Searching...", async () => {
    try {
      const report = await invoke<RelationshipPathReport>("run_relationship_path_spike");
      renderRelationshipPathReport(report);
    } catch (error) {
      byId("relationship-status").textContent = "error";
      byId("relationship-summary").textContent = String(error);
    }
  });
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
  byId("time-domain-event-count").textContent = String(report.mapped_events.length);
  byId("time-domain-status").textContent = report.narrative_order_separate
    ? "narrative order separated"
    : "narrative order aligned";
  byId("time-domain-primary").textContent = report.primary_domain_id;
  byId("time-domain-query").textContent =
    `${report.query_domain_id}:${report.query_domain_tick} -> ${report.query_world_tick}`;
  byId("time-domain-range").textContent =
    `${report.affected_world_tick_start} -> ${report.affected_world_tick_end}`;
  byId("time-domain-affected-events").textContent = report.affected_event_ids.join(", ");
  byId("time-domain-rules").textContent = report.scale_rules.map((rule) => rule.summary).join(" | ");
  byId("database-path").textContent = report.database_path;
  renderTimeDomainEvents("time-domain-events", report.mapped_events);
}

async function runTimeDomainSpike(button: HTMLButtonElement) {
  await withBusy(button, "Mapping...", async () => {
    try {
      const report = await invoke<TimeDomainReport>("run_time_domain_spike");
      renderTimeDomainReport(report);
    } catch (error) {
      byId("time-domain-status").textContent = "error";
      byId("time-domain-rules").textContent = String(error);
    }
  });
}

function handleNavigation(button: HTMLButtonElement) {
  const targetView = button.dataset.view;
  if (!targetView || !isViewId(targetView)) {
    return;
  }
  setActiveView(targetView);
}

function handleLab(button: HTMLButtonElement) {
  const lab = button.dataset.lab;
  if (lab === "memory") {
    void runSpike("run_state_graph_spike", button);
  } else if (lab === "project") {
    void runSpike("run_project_database_spike", button);
  } else if (lab === "incremental") {
    void runIncrementalSpike(button);
  } else if (lab === "snapshot") {
    void runSnapshotSpike(button);
  } else if (lab === "vector") {
    void runVectorSearchSpike(button);
  } else if (lab === "provider") {
    void runProviderAdapterSpike(button);
  } else if (lab === "relationship") {
    void runRelationshipPathSpike(button);
  } else if (lab === "timeDomain") {
    void runTimeDomainSpike(button);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  activeView = viewFromHash();
  render();
  window.addEventListener("hashchange", () => {
    activeView = viewFromHash();
    render();
  });
  byId<HTMLDivElement>("app").addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const viewButton = target.closest<HTMLButtonElement>("[data-view]");
    if (viewButton) {
      handleNavigation(viewButton);
      return;
    }

    const labButton = target.closest<HTMLButtonElement>("[data-lab]");
    if (labButton) {
      handleLab(labButton);
    }
  });
});
