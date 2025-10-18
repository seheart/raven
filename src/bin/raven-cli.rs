use std::path::PathBuf;
use std::process;
use clap::{Parser, Subcommand};
use anyhow::{Context, Result};

#[derive(Parser)]
#[command(name = "raven")]
#[command(about = "Raven - AI Agent Monitoring CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Show agent connection status
    Status {
        /// Show detailed information
        #[arg(short, long)]
        verbose: bool,
    },
    /// Open session replay at specific timestamp
    Replay {
        /// Timestamp to start replay (ISO 8601 format)
        timestamp: Option<String>,
    },
    /// Export logs and diffs to archive
    Export {
        /// Output file path
        #[arg(short, long, default_value = "raven-export.tar.gz")]
        output: String,
    },
}

fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}

fn run() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Status { verbose } => {
            status_command(verbose)?;
        }
        Commands::Replay { timestamp } => {
            replay_command(timestamp)?;
        }
        Commands::Export { output } => {
            export_command(&output)?;
        }
    }

    Ok(())
}

fn status_command(verbose: bool) -> Result<()> {
    use raven::modules::db::Database;
    use raven::modules::agent_monitor::{AgentRegistry, AgentConfig};
    use raven::modules::ollama_adapter::OllamaAdapter;
    use raven::modules::lmstudio_adapter::LMStudioAdapter;

    println!("🦅 Raven Status\n");

    // Get database path
    let project_dir = std::env::current_dir()
        .context("Failed to get current directory")?;
    let raven_dir = project_dir.join(".raven");
    let db_path = raven_dir.join("db/raven.db");

    if !db_path.exists() {
        println!("❌ Raven database not found");
        println!("   Run Raven GUI first to initialize");
        return Ok(());
    }

    // Load database
    let db = Database::new(&db_path)
        .context("Failed to open database")?;

    // Get basic stats
    let tracked_files = db.get_tracked_files()
        .context("Failed to get tracked files")?;

    println!("📊 Session Statistics:");
    println!("   Tracked Files: {}", tracked_files.len());

    // Check agent status
    println!("\n🤖 Agent Status:");

    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let mut registry = AgentRegistry::new();
        let config = AgentConfig::default();

        // Create adapters
        let ollama = Box::new(OllamaAdapter::new(None, config.clone()));
        let lmstudio = Box::new(LMStudioAdapter::new(None, None, config));

        registry.register(ollama);
        registry.register(lmstudio);

        // Start all
        if let Err(e) = registry.start_all().await {
            eprintln!("   Failed to start agents: {}", e);
            return;
        }

        // Get statuses
        let statuses = registry.get_all_status().await;

        for status in statuses {
            let status_icon = if status.is_running { "🟢" } else { "🔴" };
            println!("   {} {}", status_icon, status.agent_name);

            if verbose {
                println!("      Type: {}", status.agent_type.as_str());
                if let Some(last_seen) = status.last_seen {
                    println!("      Last Seen: {}", last_seen);
                }
                println!("      Models: {}", status.models_available.len());
                if !status.models_available.is_empty() {
                    for model in &status.models_available {
                        println!("         - {}", model);
                    }
                }
                println!("      Requests: {}", status.requests_handled);
                if status.errors > 0 {
                    println!("      Errors: {}", status.errors);
                }
                println!();
            }
        }
    });

    // Telemetry status
    let telemetry_socket = PathBuf::from("/tmp/raven-telemetry.sock");
    let telemetry_running = telemetry_socket.exists();

    println!("\n📡 Telemetry:");
    let status_icon = if telemetry_running { "🟢" } else { "🔴" };
    println!("   {} Socket: {}", status_icon, telemetry_socket.display());

    if verbose && telemetry_running {
        println!("      Listening for agent events");
    }

    Ok(())
}

fn replay_command(timestamp: Option<String>) -> Result<()> {
    println!("🎬 Session Replay\n");

    if let Some(ts) = timestamp {
        println!("Opening replay at timestamp: {}", ts);
    } else {
        println!("Opening replay from beginning");
    }

    println!("\n📝 Note: Opening Raven GUI...");
    println!("   Use the Session Replay panel to view timeline");

    // TODO: Launch Raven GUI with replay view
    println!("\n⚠️  GUI auto-launch not yet implemented");
    println!("   Run: cargo tauri dev");

    Ok(())
}

fn export_command(output: &str) -> Result<()> {
    use std::fs::File;
    use flate2::write::GzEncoder;
    use flate2::Compression;

    println!("📦 Exporting Raven Data\n");

    let project_dir = std::env::current_dir()
        .context("Failed to get current directory")?;
    let raven_dir = project_dir.join(".raven");

    if !raven_dir.exists() {
        println!("❌ No .raven directory found");
        return Ok(());
    }

    println!("Collecting files...");

    // Create tar.gz archive
    let tar_path = PathBuf::from(output);
    let tar_file = File::create(&tar_path)
        .context("Failed to create output file")?;

    let enc = GzEncoder::new(tar_file, Compression::default());
    let mut tar = tar::Builder::new(enc);

    // Add database
    let db_path = raven_dir.join("db/raven.db");
    if db_path.exists() {
        println!("   ✓ Database");
        tar.append_path_with_name(&db_path, "db/raven.db")?;
    }

    // Add snapshots
    let snapshots_dir = raven_dir.join("snapshots");
    if snapshots_dir.exists() {
        println!("   ✓ Snapshots");
        tar.append_dir_all("snapshots", &snapshots_dir)?;
    }

    // Add logs if present
    let logs_path = raven_dir.join("triggers.log");
    if logs_path.exists() {
        println!("   ✓ Trigger logs");
        tar.append_path_with_name(&logs_path, "triggers.log")?;
    }

    tar.finish()?;

    println!("\n✅ Export complete!");
    println!("   Output: {}", tar_path.display());

    // Show file size
    let metadata = std::fs::metadata(&tar_path)?;
    let size_mb = metadata.len() as f64 / 1024.0 / 1024.0;
    println!("   Size: {:.2} MB", size_mb);

    Ok(())
}
