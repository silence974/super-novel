use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! id_type {
    ($name:ident) => {
        #[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub(crate) fn new() -> Self {
                Self(Uuid::now_v7().to_string())
            }

            pub(crate) fn from_stored(value: String) -> Self {
                Self(value)
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

id_type!(ProjectId);
id_type!(WorkId);
id_type!(VolumeId);
id_type!(ChapterId);
id_type!(CheckpointId);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChapterStatus {
    Planning,
    Drafting,
    Revising,
    Final,
}

impl FromStr for ChapterStatus {
    type Err = String;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        match value {
            "planning" => Ok(Self::Planning),
            "drafting" => Ok(Self::Drafting),
            "revising" => Ok(Self::Revising),
            "final" => Ok(Self::Final),
            _ => Err(format!("unknown chapter status `{value}`")),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckpointSource {
    Manual,
    Periodic,
    ChapterSwitch,
    ProjectClose,
    Restore,
}

impl CheckpointSource {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Periodic => "periodic",
            Self::ChapterSwitch => "chapter_switch",
            Self::ProjectClose => "project_close",
            Self::Restore => "restore",
        }
    }
}

impl FromStr for CheckpointSource {
    type Err = String;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        match value {
            "manual" => Ok(Self::Manual),
            "periodic" => Ok(Self::Periodic),
            "chapter_switch" => Ok(Self::ChapterSwitch),
            "project_close" => Ok(Self::ProjectClose),
            "restore" => Ok(Self::Restore),
            _ => Err(format!("unknown checkpoint source `{value}`")),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: ProjectId,
    pub name: String,
    pub work_id: WorkId,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub schema_version: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVolume {
    pub title: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChapter {
    pub volume_id: Option<VolumeId>,
    pub title: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkingDraft {
    pub chapter_id: ChapterId,
    pub expected_edit_revision: u64,
    pub content: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCheckpoint {
    pub chapter_id: ChapterId,
    pub expected_edit_revision: u64,
    pub source: CheckpointSource,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCheckpoint {
    pub chapter_id: ChapterId,
    pub checkpoint_id: CheckpointId,
    pub expected_edit_revision: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub id: ChapterId,
    pub volume_id: Option<VolumeId>,
    pub title: String,
    pub status: ChapterStatus,
    pub position: i64,
    pub content: String,
    pub edit_revision: u64,
    pub non_whitespace_char_count: u64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterSummary {
    pub id: ChapterId,
    pub title: String,
    pub status: ChapterStatus,
    pub position: i64,
    pub edit_revision: u64,
    pub non_whitespace_char_count: u64,
    pub updated_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeNode {
    pub id: VolumeId,
    pub title: String,
    pub position: i64,
    pub chapters: Vec<ChapterSummary>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outline {
    pub work_id: WorkId,
    pub volumes: Vec<VolumeNode>,
    pub ungrouped_chapters: Vec<ChapterSummary>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterCheckpoint {
    pub id: CheckpointId,
    pub chapter_id: ChapterId,
    pub source: CheckpointSource,
    pub source_edit_revision: u64,
    pub restored_from_checkpoint_id: Option<CheckpointId>,
    pub content: String,
    pub non_whitespace_char_count: u64,
    pub created_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterCheckpointSummary {
    pub id: CheckpointId,
    pub chapter_id: ChapterId,
    pub source: CheckpointSource,
    pub source_edit_revision: u64,
    pub restored_from_checkpoint_id: Option<CheckpointId>,
    pub non_whitespace_char_count: u64,
    pub created_at_ms: i64,
}
