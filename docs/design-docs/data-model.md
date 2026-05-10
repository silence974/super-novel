# Data Model

## 目的

定义作品、章节、正文、设定、事件、图谱、向量索引、检查结果和快照的领域数据模型。

## 数据分类

### 事实源数据

- Project
- Work
- Chapter
- Scene
- Entity
- Event
- Confirmed Fact
- Calendar
- Time Domain
- Snapshot

### 候选数据

- Candidate Fact
- Candidate Event
- Candidate Relation
- Candidate Repair Patch

### 派生数据

- Vector Entry
- Full Text Index
- Graph Query Cache
- Check Result Index

## 核心实体草案

### Project

字段建议：

- `id`
- `name`
- `root_path`
- `created_at`
- `updated_at`
- `schema_version`

### Chapter

字段建议：

- `id`
- `work_id`
- `title`
- `order_index`
- `content`
- `status`
- `updated_at`

### Scene

字段建议：

- `id`
- `chapter_id`
- `title`
- `order_index`
- `content_range`
- `linked_event_ids`

### Entity

字段建议：

- `id`
- `type`
- `name`
- `aliases`
- `description`
- `status`

实体类型：

- `character`
- `location`
- `item`
- `skill`
- `ability`
- `organization`
- `faction`
- `concept`

### Event

字段建议：

- `id`
- `title`
- `description`
- `world_time`
- `calendar_id`
- `time_domain_id`
- `narrative_order`
- `participants`
- `state_changes`
- `source_refs`
- `confirmation_status`

### Fact

字段建议：

- `id`
- `fact_type`
- `subject_entity_id`
- `object_entity_id`
- `value`
- `valid_from`
- `valid_to`
- `source_event_id`
- `status`

### Check Result

字段建议：

- `id`
- `severity`
- `rule_id`
- `message`
- `entity_refs`
- `event_refs`
- `chapter_refs`
- `text_ranges`
- `repair_patch_ids`
- `status`

## 图关系类型

- `LOCATED_AT`
- `HOLDS`
- `OWNS`
- `KNOWS`
- `ALLY_OF`
- `ENEMY_OF`
- `MEMBER_OF`
- `LEARNS`
- `USES`
- `CAUSES`
- `OCCURS_AT`
- `PARTICIPATES_IN`
- `MENTIONED_IN`

## 向量条目

向量条目用于语义召回，不作为正式事实源。

向量来源：

- 章节正文。
- 设定说明。
- 事件描述。
- 角色资料。
- 世界观条目。

## Open Questions

- 图数据库最终节点和边 schema 取决于选型结果。
- 向量库最终字段取决于 embedding 和索引实现。
