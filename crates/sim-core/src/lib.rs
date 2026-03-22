pub mod analyzer;
pub mod constraint;
pub mod entity;
pub mod force;
pub mod runtime;
pub mod scene;
pub mod solver;

pub fn crate_name() -> &'static str {
    "sim-core"
}
