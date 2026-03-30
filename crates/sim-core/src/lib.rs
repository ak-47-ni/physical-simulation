pub mod analyzer;
pub mod arc_track;
pub mod bridge;
pub mod constraint;
pub mod entity;
pub mod force;
pub mod playback;
pub mod runtime;
pub mod scene;
pub mod solver;

pub fn crate_name() -> &'static str {
    "sim-core"
}
