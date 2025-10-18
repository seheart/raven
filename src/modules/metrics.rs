use sysinfo::{System, RefreshKind, CpuRefreshKind, MemoryRefreshKind, ProcessRefreshKind, Pid, Networks, Disks};
use tracing::{debug, warn};
use std::collections::HashMap;

/// System metrics collector with per-process tracking
pub struct MetricsCollector {
    system: System,
    networks: Networks,
    disks: Disks,
    tracked_processes: HashMap<String, Pid>, // agent_name -> PID
}

impl MetricsCollector {
    /// Create a new metrics collector
    pub fn new() -> Self {
        let system = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()),
        );

        let networks = Networks::new_with_refreshed_list();
        let disks = Disks::new_with_refreshed_list();

        Self {
            system,
            networks,
            disks,
            tracked_processes: HashMap::new(),
        }
    }

    /// Get current CPU usage percentage
    pub fn cpu_usage(&mut self) -> f64 {
        self.system.refresh_cpu_all();
        let usage = self.system.global_cpu_usage();
        debug!("CPU usage: {:.2}%", usage);
        usage as f64
    }

    /// Get current memory usage percentage
    pub fn memory_usage(&mut self) -> f64 {
        self.system.refresh_memory();
        let used = self.system.used_memory();
        let total = self.system.total_memory();
        let usage = (used as f64 / total as f64) * 100.0;
        debug!("Memory usage: {:.2}% ({} MB / {} MB)", usage, used / 1024 / 1024, total / 1024 / 1024);
        usage
    }

    /// Get system metrics as a tuple (cpu%, mem%)
    pub fn collect(&mut self) -> (f64, f64) {
        (self.cpu_usage(), self.memory_usage())
    }

    /// Get detailed memory info in MB
    pub fn memory_info(&mut self) -> MemoryInfo {
        self.system.refresh_memory();
        MemoryInfo {
            total_mb: self.system.total_memory() / 1024 / 1024,
            used_mb: self.system.used_memory() / 1024 / 1024,
            available_mb: self.system.available_memory() / 1024 / 1024,
        }
    }

    /// Discover and track processes by name
    pub fn discover_processes(&mut self, process_names: &[&str]) {
        self.system.refresh_all();

        for (pid, process) in self.system.processes() {
            let process_name = process.name().to_string_lossy().to_lowercase();

            for &search_name in process_names {
                if process_name.contains(&search_name.to_lowercase()) {
                    debug!("Discovered process: {} (PID: {})", search_name, pid);
                    self.tracked_processes.insert(search_name.to_string(), *pid);
                }
            }
        }
    }

    /// Manually track a process by PID
    pub fn track_process(&mut self, agent_name: String, pid: Pid) {
        self.tracked_processes.insert(agent_name, pid);
    }

    /// Get stats for a specific tracked process
    pub fn get_process_stats(&mut self, agent_name: &str) -> Option<ProcessStats> {
        let pid = self.tracked_processes.get(agent_name)?;

        self.system.refresh_all();
        let process = self.system.process(*pid)?;

        Some(ProcessStats {
            agent_name: agent_name.to_string(),
            pid: pid.as_u32(),
            cpu_usage: process.cpu_usage() as f64,
            memory_mb: process.memory() / 1024 / 1024,
            virtual_memory_mb: process.virtual_memory() / 1024 / 1024,
            disk_read_bytes: process.disk_usage().total_read_bytes,
            disk_write_bytes: process.disk_usage().total_written_bytes,
            status: format!("{:?}", process.status()),
        })
    }

    /// Get stats for all tracked processes
    pub fn get_all_process_stats(&mut self) -> Vec<ProcessStats> {
        let agent_names: Vec<String> = self.tracked_processes.keys().cloned().collect();

        agent_names
            .iter()
            .filter_map(|name| self.get_process_stats(name))
            .collect()
    }

    /// Get network statistics (bytes sent/received)
    pub fn get_network_stats(&mut self) -> NetworkStats {
        self.networks.refresh(true);

        let mut total_received = 0;
        let mut total_transmitted = 0;

        for (_interface_name, network) in &self.networks {
            total_received += network.total_received();
            total_transmitted += network.total_transmitted();
        }

        NetworkStats {
            total_received_bytes: total_received,
            total_transmitted_bytes: total_transmitted,
            total_received_mb: total_received / 1024 / 1024,
            total_transmitted_mb: total_transmitted / 1024 / 1024,
        }
    }

    /// Get disk I/O statistics
    pub fn get_disk_stats(&mut self) -> Vec<DiskStats> {
        self.disks.refresh(true);

        self.disks
            .iter()
            .map(|disk| {
                let total_space = disk.total_space();
                let available_space = disk.available_space();
                let used_space = total_space - available_space;

                DiskStats {
                    name: disk.name().to_string_lossy().to_string(),
                    mount_point: disk.mount_point().to_string_lossy().to_string(),
                    total_gb: total_space / 1024 / 1024 / 1024,
                    used_gb: used_space / 1024 / 1024 / 1024,
                    available_gb: available_space / 1024 / 1024 / 1024,
                    usage_percent: (used_space as f64 / total_space as f64) * 100.0,
                    file_system: disk.file_system().to_string_lossy().to_string(),
                }
            })
            .collect()
    }

    /// Collect comprehensive system snapshot
    pub fn collect_snapshot(&mut self) -> SystemSnapshot {
        let (cpu, mem) = self.collect();
        let mem_info = self.memory_info();
        let process_stats = self.get_all_process_stats();
        let network_stats = self.get_network_stats();
        let disk_stats = self.get_disk_stats();

        SystemSnapshot {
            timestamp: chrono::Utc::now().to_rfc3339(),
            cpu_percent: cpu,
            memory_percent: mem,
            memory_used_mb: mem_info.used_mb,
            memory_total_mb: mem_info.total_mb,
            process_stats,
            network_stats,
            disk_stats,
        }
    }

    /// Get list of tracked process names
    pub fn tracked_process_names(&self) -> Vec<String> {
        self.tracked_processes.keys().cloned().collect()
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct MemoryInfo {
    pub total_mb: u64,
    pub used_mb: u64,
    pub available_mb: u64,
}

#[derive(Debug, Clone)]
pub struct ProcessStats {
    pub agent_name: String,
    pub pid: u32,
    pub cpu_usage: f64,
    pub memory_mb: u64,
    pub virtual_memory_mb: u64,
    pub disk_read_bytes: u64,
    pub disk_write_bytes: u64,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct NetworkStats {
    pub total_received_bytes: u64,
    pub total_transmitted_bytes: u64,
    pub total_received_mb: u64,
    pub total_transmitted_mb: u64,
}

#[derive(Debug, Clone)]
pub struct DiskStats {
    pub name: String,
    pub mount_point: String,
    pub total_gb: u64,
    pub used_gb: u64,
    pub available_gb: u64,
    pub usage_percent: f64,
    pub file_system: String,
}

#[derive(Debug, Clone)]
pub struct SystemSnapshot {
    pub timestamp: String,
    pub cpu_percent: f64,
    pub memory_percent: f64,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub process_stats: Vec<ProcessStats>,
    pub network_stats: NetworkStats,
    pub disk_stats: Vec<DiskStats>,
}
