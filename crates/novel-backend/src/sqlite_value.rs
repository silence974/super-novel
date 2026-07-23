use crate::{BackendError, Result};

pub(crate) fn to_sql_i64(value: u64, field: &'static str) -> Result<i64> {
    i64::try_from(value)
        .map_err(|_| BackendError::CorruptData(format!("{field} exceeds SQLite INTEGER range")))
}

pub(crate) fn from_sql_i64(value: i64, field: &'static str) -> Result<u64> {
    u64::try_from(value)
        .map_err(|_| BackendError::CorruptData(format!("{field} must not be negative")))
}

#[cfg(test)]
mod tests {
    use super::{from_sql_i64, to_sql_i64};
    use crate::BackendError;

    #[test]
    fn rejects_unsigned_values_larger_than_sqlite_integer() {
        let error = to_sql_i64(u64::MAX, "edit_revision").unwrap_err();
        assert!(matches!(error, BackendError::CorruptData(message)
            if message.contains("edit_revision")));
    }

    #[test]
    fn rejects_negative_sqlite_values_for_unsigned_fields() {
        let error = from_sql_i64(-1, "character_count").unwrap_err();
        assert!(matches!(error, BackendError::CorruptData(message)
            if message.contains("character_count")));
    }
}
