use std::collections::HashMap;

use crate::analyzer::TrajectorySample;
use crate::runtime::{RuntimeFramePayload, RuntimeScene};
use serde::{Deserialize, Serialize};

pub const DEFAULT_REALTIME_DURATION_SECONDS: f64 = 40.0;
pub const DEFAULT_PRECOMPUTE_DURATION_SECONDS: f64 = 20.0;
pub const PRECOMPUTE_CHUNK_STEPS: u64 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackMode {
    Realtime,
    Precomputed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackConfig {
    pub mode: PlaybackMode,
    pub realtime_duration_seconds: f64,
    pub precompute_duration_seconds: f64,
}

impl Default for PlaybackConfig {
    fn default() -> Self {
        Self {
            mode: PlaybackMode::Realtime,
            realtime_duration_seconds: DEFAULT_REALTIME_DURATION_SECONDS,
            precompute_duration_seconds: DEFAULT_PRECOMPUTE_DURATION_SECONDS,
        }
    }
}

impl PlaybackConfig {
    pub fn total_duration_seconds(&self) -> f64 {
        match self.mode {
            PlaybackMode::Realtime => self.realtime_duration_seconds,
            PlaybackMode::Precomputed => self.precompute_duration_seconds,
        }
    }

    pub fn validate(&self) -> Result<(), InvalidPlaybackConfig> {
        validate_duration("realtime_duration_seconds", self.realtime_duration_seconds)?;
        validate_duration(
            "precompute_duration_seconds",
            self.precompute_duration_seconds,
        )?;
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct InvalidPlaybackConfig {
    pub field: &'static str,
    pub value: f64,
}

fn validate_duration(field: &'static str, value: f64) -> Result<(), InvalidPlaybackConfig> {
    if value.is_finite() && value > 0.0 {
        Ok(())
    } else {
        Err(InvalidPlaybackConfig { field, value })
    }
}

#[derive(Debug, Clone)]
pub struct PreparedPlayback {
    frames: Vec<RuntimeFramePayload>,
    analyzer_samples_by_id: HashMap<String, Vec<TrajectorySample>>,
}

impl PreparedPlayback {
    pub fn new(
        frames: Vec<RuntimeFramePayload>,
        analyzer_samples_by_id: HashMap<String, Vec<TrajectorySample>>,
    ) -> Self {
        Self {
            frames,
            analyzer_samples_by_id,
        }
    }

    pub fn frame(&self, index: usize) -> Option<&RuntimeFramePayload> {
        self.frames.get(index)
    }

    pub fn last_index(&self) -> usize {
        self.frames.len().saturating_sub(1)
    }

    pub fn analyzer_samples(&self, id: &str) -> Option<&[TrajectorySample]> {
        self.analyzer_samples_by_id.get(id).map(Vec::as_slice)
    }
}

#[derive(Debug, Clone)]
pub struct PrecomputeSession {
    runtime: RuntimeScene,
    total_steps: u64,
    frames: Vec<RuntimeFramePayload>,
}

impl PrecomputeSession {
    pub fn new(runtime: RuntimeScene, total_steps: u64) -> Self {
        let frames = vec![runtime.current_frame()];

        Self {
            runtime,
            total_steps,
            frames,
        }
    }

    pub fn progress(&self) -> f64 {
        if self.total_steps == 0 {
            return 1.0;
        }

        self.completed_steps() as f64 / self.total_steps as f64
    }

    pub fn advance(&mut self, chunk_steps: u64) -> bool {
        let remaining_steps = self.total_steps.saturating_sub(self.completed_steps());
        let step_count = remaining_steps.min(chunk_steps);

        for _ in 0..step_count {
            self.frames.push(self.runtime.step());
        }

        self.completed_steps() >= self.total_steps
    }

    pub fn analyzer_samples(&self, id: &str) -> Option<&[TrajectorySample]> {
        self.runtime.analyzer_samples(id)
    }

    pub fn finalize(self) -> PreparedPlayback {
        PreparedPlayback::new(self.frames, self.runtime.all_analyzer_samples())
    }

    fn completed_steps(&self) -> u64 {
        self.frames.len().saturating_sub(1) as u64
    }
}
