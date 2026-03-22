use sim_core::crate_name;

#[test]
fn exposes_the_crate_name() {
    assert_eq!(crate_name(), "sim-core");
}
