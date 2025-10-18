/// Unit tests for Raven modules
#[cfg(test)]
mod db_tests {
    use crate::modules::db::{Database, Event};
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn setup_test_db() -> (Database, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let db = Database::new(&db_path).unwrap();
        (db, temp_dir)
    }

    #[test]
    fn test_database_creation() {
        let (db, _temp) = setup_test_db();
        // Database should be created successfully
        assert!(db.get_all_events().is_ok());
    }

    #[test]
    fn test_insert_event() {
        let (db, _temp) = setup_test_db();

        let id = db.insert_event(
            "2025-10-17T12:00:00Z",
            Some("test.rs"),
            "created",
            Some("+ new file"),
            12.5,
            34.2,
            Some("session-123"),
        ).unwrap();

        assert!(id > 0);
    }

    #[test]
    fn test_get_all_events() {
        let (db, _temp) = setup_test_db();

        // Insert multiple events
        db.insert_event(
            "2025-10-17T12:00:00Z",
            Some("file1.rs"),
            "created",
            None,
            10.0,
            20.0,
            Some("session-1"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T12:01:00Z",
            Some("file2.rs"),
            "modified",
            Some("@@ -1 +1 @@"),
            15.0,
            25.0,
            Some("session-1"),
        ).unwrap();

        let events = db.get_all_events().unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].filepath, Some("file1.rs".to_string()));
        assert_eq!(events[1].filepath, Some("file2.rs".to_string()));
    }

    #[test]
    fn test_get_events_by_session() {
        let (db, _temp) = setup_test_db();

        // Insert events for different sessions
        db.insert_event(
            "2025-10-17T12:00:00Z",
            Some("file1.rs"),
            "created",
            None,
            10.0,
            20.0,
            Some("session-1"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T12:01:00Z",
            Some("file2.rs"),
            "modified",
            None,
            15.0,
            25.0,
            Some("session-2"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T12:02:00Z",
            Some("file3.rs"),
            "created",
            None,
            12.0,
            22.0,
            Some("session-1"),
        ).unwrap();

        let session1_events = db.get_events_by_session("session-1").unwrap();
        assert_eq!(session1_events.len(), 2);

        let session2_events = db.get_events_by_session("session-2").unwrap();
        assert_eq!(session2_events.len(), 1);
    }

    #[test]
    fn test_get_file_history() {
        let (db, _temp) = setup_test_db();

        // Insert multiple events for the same file
        db.insert_event(
            "2025-10-17T12:00:00Z",
            Some("main.rs"),
            "created",
            None,
            10.0,
            20.0,
            Some("session-1"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T12:01:00Z",
            Some("main.rs"),
            "modified",
            Some("@@ -1,2 +1,3 @@"),
            12.0,
            22.0,
            Some("session-1"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T12:02:00Z",
            Some("other.rs"),
            "created",
            None,
            11.0,
            21.0,
            Some("session-1"),
        ).unwrap();

        let history = db.get_file_history("main.rs").unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].change_type, "created");
        assert_eq!(history[1].change_type, "modified");
    }

    #[test]
    fn test_get_event_by_id() {
        let (db, _temp) = setup_test_db();

        let id = db.insert_event(
            "2025-10-17T12:00:00Z",
            Some("test.rs"),
            "created",
            Some("+ content"),
            10.0,
            20.0,
            Some("session-1"),
        ).unwrap();

        let event = db.get_event_by_id(id).unwrap();
        assert!(event.is_some());

        let event = event.unwrap();
        assert_eq!(event.id, id);
        assert_eq!(event.filepath, Some("test.rs".to_string()));
        assert_eq!(event.change_type, "created");

        // Test non-existent ID
        let missing = db.get_event_by_id(99999).unwrap();
        assert!(missing.is_none());
    }

    #[test]
    fn test_get_tracked_files() {
        let (db, _temp) = setup_test_db();

        // Insert events for different files
        db.insert_event(
            "2025-10-17T12:00:00Z",
            Some("file1.rs"),
            "created",
            None,
            10.0,
            20.0,
            Some("session-1"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T12:01:00Z",
            Some("file2.rs"),
            "created",
            None,
            11.0,
            21.0,
            Some("session-1"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T12:02:00Z",
            Some("file1.rs"),
            "modified",
            None,
            12.0,
            22.0,
            Some("session-1"),
        ).unwrap();

        let files = db.get_tracked_files().unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.contains(&"file1.rs".to_string()));
        assert!(files.contains(&"file2.rs".to_string()));
    }

    #[test]
    fn test_get_events_by_time_range() {
        let (db, _temp) = setup_test_db();

        db.insert_event(
            "2025-10-17T10:00:00Z",
            Some("file1.rs"),
            "created",
            None,
            10.0,
            20.0,
            Some("session-1"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T12:00:00Z",
            Some("file2.rs"),
            "modified",
            None,
            11.0,
            21.0,
            Some("session-1"),
        ).unwrap();

        db.insert_event(
            "2025-10-17T14:00:00Z",
            Some("file3.rs"),
            "created",
            None,
            12.0,
            22.0,
            Some("session-1"),
        ).unwrap();

        let events = db.get_events_by_time_range(
            "2025-10-17T11:00:00Z",
            "2025-10-17T13:00:00Z",
        ).unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].filepath, Some("file2.rs".to_string()));
    }

    #[test]
    fn test_empty_database() {
        let (db, _temp) = setup_test_db();

        let events = db.get_all_events().unwrap();
        assert_eq!(events.len(), 0);

        let files = db.get_tracked_files().unwrap();
        assert_eq!(files.len(), 0);
    }
}

#[cfg(test)]
mod diff_engine_tests {
    use crate::modules::diff_engine::DiffEngine;

    #[test]
    fn test_identical_content() {
        let engine = DiffEngine::new();
        let old = "line 1\nline 2\nline 3";
        let new = "line 1\nline 2\nline 3";

        let diff = engine.generate_diff(old, new);
        // Should have no changes
        assert!(!diff.contains('+'));
        assert!(!diff.contains('-'));
    }

    #[test]
    fn test_addition() {
        let engine = DiffEngine::new();
        let old = "line 1\nline 2";
        let new = "line 1\nline 2\nline 3";

        let diff = engine.generate_diff(old, new);
        assert!(diff.contains("+line 3"));
    }

    #[test]
    fn test_deletion() {
        let engine = DiffEngine::new();
        let old = "line 1\nline 2\nline 3";
        let new = "line 1\nline 3";

        let diff = engine.generate_diff(old, new);
        assert!(diff.contains("-line 2"));
    }

    #[test]
    fn test_modification() {
        let engine = DiffEngine::new();
        let old = "hello world";
        let new = "hello rust";

        let diff = engine.generate_diff(old, new);
        assert!(diff.contains("-hello world") || diff.contains("+hello rust"));
    }

    #[test]
    fn test_empty_files() {
        let engine = DiffEngine::new();
        let diff = engine.generate_diff("", "");
        assert!(!diff.contains('+'));
        assert!(!diff.contains('-'));
    }

    #[test]
    fn test_multiline_changes() {
        let engine = DiffEngine::new();
        let old = "fn main() {\n    println!(\"Hello\");\n}";
        let new = "fn main() {\n    println!(\"Hello, world!\");\n    println!(\"Goodbye!\");\n}";

        let diff = engine.generate_diff(old, new);
        assert!(diff.contains('+') || diff.contains('-'));
    }
}

#[cfg(test)]
mod metrics_tests {
    use crate::modules::metrics::MetricsCollector;

    #[test]
    fn test_metrics_collection() {
        let mut collector = MetricsCollector::new();
        let (cpu, mem) = collector.collect();

        // CPU and memory should be between 0 and 100
        assert!(cpu >= 0.0 && cpu <= 100.0);
        assert!(mem >= 0.0 && mem <= 100.0);
    }

    #[test]
    fn test_memory_info() {
        let mut collector = MetricsCollector::new();
        let info = collector.memory_info();

        // Total memory should be greater than 0
        assert!(info.total_mb > 0);
        // Used memory should be less than or equal to total
        assert!(info.used_mb <= info.total_mb);
    }

    #[test]
    fn test_multiple_collections() {
        let mut collector = MetricsCollector::new();

        // Collect metrics multiple times
        for _ in 0..5 {
            let (cpu, mem) = collector.collect();
            assert!(cpu >= 0.0 && cpu <= 100.0);
            assert!(mem >= 0.0 && mem <= 100.0);
        }
    }
}
