#!/usr/bin/env python3
"""
Test telemetry sender for Raven Phase II.1
Sends sample agent events to the Unix socket server.
"""

import socket
import json
import time
import sys
import os

# Socket path (matches TelemetryConfig::default())
SOCKET_PATH = "/tmp/raven-telemetry.sock"

def send_event(sock, event):
    """Send a single event to the telemetry server"""
    try:
        # Convert event to JSON and add newline
        event_json = json.dumps(event) + "\n"
        sock.sendall(event_json.encode('utf-8'))
        print(f"✓ Sent: {event['agent']} - {event['event']} - {event['message']}")
        return True
    except Exception as e:
        print(f"✗ Error sending event: {e}")
        return False

def main():
    """Main test function"""
    print("🐦‍⬛ Raven Telemetry Test Sender")
    print(f"Socket path: {SOCKET_PATH}")
    print("-" * 60)

    # Check if socket exists
    if not os.path.exists(SOCKET_PATH):
        print(f"✗ Socket does not exist at {SOCKET_PATH}")
        print("  Make sure Raven is running first!")
        sys.exit(1)

    try:
        # Connect to Unix socket
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(SOCKET_PATH)
        print("✓ Connected to telemetry server\n")

        # Sample events to send
        events = [
            {
                "agent": "claude",
                "event": "edit",
                "file": "src/main.rs",
                "lines_changed": 42,
                "duration_ms": 3480,
                "message": "Refactored main function to use async/await"
            },
            {
                "agent": "claude",
                "event": "create",
                "file": "src/modules/telemetry_listener.rs",
                "lines_changed": 220,
                "duration_ms": 5200,
                "message": "Created telemetry listener module with Unix socket server"
            },
            {
                "agent": "ollama",
                "event": "read",
                "file": "README.md",
                "duration_ms": 150,
                "message": "Read project README for context"
            },
            {
                "agent": "ollama",
                "event": "execute",
                "duration_ms": 2100,
                "message": "Ran cargo test suite",
                "metadata": {
                    "command": "cargo test",
                    "exit_code": 0,
                    "tests_passed": 25
                }
            },
            {
                "agent": "claude",
                "event": "edit",
                "file": "src/modules/db.rs",
                "lines_changed": 87,
                "duration_ms": 4100,
                "message": "Added agent_events table and query methods"
            },
            {
                "agent": "lmstudio",
                "event": "read",
                "file": "docs/API.md",
                "duration_ms": 320,
                "message": "Reviewed API documentation"
            },
            {
                "agent": "claude",
                "event": "delete",
                "file": "test/old_test.rs",
                "duration_ms": 100,
                "message": "Removed obsolete test file"
            },
            {
                "agent": "ollama",
                "event": "edit",
                "file": "Cargo.toml",
                "lines_changed": 3,
                "duration_ms": 450,
                "message": "Updated dependencies",
                "metadata": {
                    "updated_deps": ["tokio", "serde_json"]
                }
            }
        ]

        # Send events with small delay
        print("Sending test events...\n")
        success_count = 0
        for i, event in enumerate(events, 1):
            if send_event(sock, event):
                success_count += 1
            time.sleep(0.5)  # Small delay between events

        print(f"\n{'-' * 60}")
        print(f"Sent {success_count}/{len(events)} events successfully")
        print("\nYou can now check the Raven UI to see these events!")
        print("Or query the database directly:")
        print("  sqlite3 .raven/db/raven.db 'SELECT * FROM agent_events;'")

    except FileNotFoundError:
        print(f"✗ Socket not found at {SOCKET_PATH}")
        print("  Make sure Raven is running first!")
        sys.exit(1)
    except ConnectionRefusedError:
        print(f"✗ Connection refused to {SOCKET_PATH}")
        print("  Make sure Raven's telemetry server is running!")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)
    finally:
        if 'sock' in locals():
            sock.close()
            print("\n✓ Disconnected from server")

if __name__ == "__main__":
    main()
