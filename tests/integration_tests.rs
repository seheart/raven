/// Integration tests for Raven core modules
/// These tests run independently of the Tauri app

use tempfile::TempDir;
use std::path::PathBuf;

// Mock database tests (without importing the actual module to avoid Tauri deps)
#[test]
fn test_basic_sqlite_operations() {
    use rusqlite::{Connection, Result};

    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");

    let conn = Connection::open(&db_path).unwrap();

    // Create events table
    conn.execute(
        "CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            filepath TEXT,
            change_type TEXT,
            cpu REAL,
            mem REAL
        )",
        [],
    ).unwrap();

    // Insert test event
    conn.execute(
        "INSERT INTO events (timestamp, filepath, change_type, cpu, mem)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        ("2025-10-17T12:00:00Z", "test.rs", "created", 10.0, 20.0),
    ).unwrap();

    // Query events
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM events").unwrap();
    let count: i64 = stmt.query_row([], |row| row.get(0)).unwrap();

    assert_eq!(count, 1);
}

#[test]
fn test_diff_generation() {
    use similar::TextDiff;

    let old = "line 1\nline 2\nline 3";
    let new = "line 1\nline 2 modified\nline 3\nline 4";

    let diff = TextDiff::from_lines(old, new);
    let unified = diff.unified_diff().header("old", "new").to_string();

    assert!(unified.contains("line 2"));
    assert!(unified.contains("line 4"));
}

#[test]
fn test_metrics_collection() {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    // Check CPU count
    let cpu_count = sys.cpus().len();
    assert!(cpu_count > 0);

    // Check memory
    let total_mem = sys.total_memory();
    let used_mem = sys.used_memory();

    assert!(total_mem > 0);
    assert!(used_mem <= total_mem);
}

#[test]
fn test_file_watching_setup() {
    use notify::Config;

    // Test that notify configuration can be created
    let config = Config::default();
    assert!(config.poll_interval().is_none()); // Default should not poll
}

#[test]
fn test_timestamp_formatting() {
    use chrono::Utc;

    let now = Utc::now();
    let formatted = now.to_rfc3339();

    // Check format is valid RFC3339
    assert!(formatted.contains('T'));
    assert!(formatted.contains('Z') || formatted.contains('+') || formatted.contains('-'));
}

#[test]
fn test_session_id_generation() {
    use uuid::Uuid;

    let session_id = Uuid::new_v4().to_string();

    // UUID should be 36 characters (32 hex + 4 hyphens)
    assert_eq!(session_id.len(), 36);
    assert_eq!(session_id.matches('-').count(), 4);
}

#[test]
fn test_database_query_performance() {
    use rusqlite::Connection;
    use std::time::Instant;

    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("perf_test.db");
    let conn = Connection::open(&db_path).unwrap();

    conn.execute(
        "CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            filepath TEXT,
            change_type TEXT
        )",
        [],
    ).unwrap();

    // Insert 1000 events and measure time
    let start = Instant::now();

    for i in 0..1000 {
        conn.execute(
            "INSERT INTO events (timestamp, filepath, change_type)
             VALUES (?1, ?2, ?3)",
            (
                format!("2025-10-17T12:{:02}:00Z", i % 60),
                format!("file{}.rs", i),
                if i % 3 == 0 { "created" } else if i % 3 == 1 { "modified" } else { "deleted" },
            ),
        ).unwrap();
    }

    let duration = start.elapsed();

    // Should complete in less than 1 second
    assert!(duration.as_secs() < 1, "Database inserts took too long: {:?}", duration);

    // Query all events
    let start = Instant::now();
    let mut stmt = conn.prepare("SELECT * FROM events").unwrap();
    let count: usize = stmt.query_map([], |_| Ok(())).unwrap().count();
    let query_duration = start.elapsed();

    assert_eq!(count, 1000);
    assert!(query_duration.as_millis() < 100, "Query took too long: {:?}", query_duration);
}

#[test]
fn test_concurrent_database_access() {
    use rusqlite::Connection;
    use std::thread;
    use std::sync::Arc;
    use std::sync::Mutex;

    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("concurrent.db");

    let conn = Connection::open(&db_path).unwrap();
    conn.execute(
        "CREATE TABLE events (id INTEGER PRIMARY KEY, value INTEGER)",
        [],
    ).unwrap();
    drop(conn);

    let db_path = Arc::new(db_path);
    let counter = Arc::new(Mutex::new(0));

    let mut handles = vec![];

    // Spawn 10 threads that each insert 10 records
    for thread_id in 0..10 {
        let path = db_path.clone();
        let counter = counter.clone();

        let handle = thread::spawn(move || {
            let conn = Connection::open(path.as_ref()).unwrap();

            for i in 0..10 {
                conn.execute(
                    "INSERT INTO events (value) VALUES (?1)",
                    [thread_id * 100 + i],
                ).unwrap();

                let mut count = counter.lock().unwrap();
                *count += 1;
            }
        });

        handles.push(handle);
    }

    // Wait for all threads to complete
    for handle in handles {
        handle.join().unwrap();
    }

    // Verify all inserts succeeded
    let final_count = *counter.lock().unwrap();
    assert_eq!(final_count, 100);

    // Verify database has all records
    let conn = Connection::open(db_path.as_ref()).unwrap();
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM events").unwrap();
    let db_count: i64 = stmt.query_row([], |row| row.get(0)).unwrap();
    assert_eq!(db_count, 100);
}

#[test]
fn test_large_diff_handling() {
    use similar::TextDiff;

    // Generate large file content
    let old_lines: Vec<String> = (0..10000).map(|i| format!("Line {}", i)).collect();
    let mut new_lines = old_lines.clone();

    // Modify every 10th line
    for i in (0..10000).step_by(10) {
        new_lines[i] = format!("Modified line {}", i);
    }

    let old = old_lines.join("\n");
    let new = new_lines.join("\n");

    let start = std::time::Instant::now();
    let diff = TextDiff::from_lines(&old, &new);
    let duration = start.elapsed();

    // Diff should complete in reasonable time
    assert!(duration.as_secs() < 1, "Large diff took too long: {:?}", duration);

    // Verify diff has changes
    assert!(diff.ops().len() > 0);
}

#[test]
fn test_memory_usage_monitoring() {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_memory();

    let total = sys.total_memory();
    let available = sys.available_memory();
    let used = sys.used_memory();

    // Sanity checks
    assert!(total > 0);
    assert!(available <= total);
    assert!(used <= total);
    assert!(used + available <= total * 2); // Rough check for accounting

    // Memory percentage
    let mem_percent = (used as f64 / total as f64) * 100.0;
    assert!(mem_percent >= 0.0 && mem_percent <= 100.0);
}
