use serde::{Deserialize, Serialize};

use crate::ProjectId;

pub(crate) const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct ProjectManifest {
    pub format_version: u32,
    pub project_id: ProjectId,
    pub name: String,
}
