use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeEntityFrame, RuntimeFramePayload, RuntimeScene};
use sim_core::scene::{CompileSceneRequest, compile_scene};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn ball(id: &str, position: Vector2, velocity: Vector2) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Ball { radius: 0.5 },
        position,
        rotation_radians: 0.0,
        initial_velocity: velocity,
        mass: 1.0,
        is_static: false,
        friction_coefficient: 0.2,
        restitution_coefficient: 0.0,
    }
}

fn runtime_for_scene(
    entity: EntityDefinition,
    constraint: ConstraintDefinition,
    gravity: Vector2,
    fixed_delta_seconds: f64,
) -> RuntimeScene {
    let compiled = compile_scene(&CompileSceneRequest {
        entities: vec![entity],
        constraints: vec![constraint],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity".to_string(),
            acceleration: gravity,
        }],
        analyzers: vec![],
    })
    .expect("scene should compile");

    RuntimeScene::new(compiled, fixed_delta_seconds)
}

fn run_steps(runtime: &mut RuntimeScene, steps: usize) {
    for _ in 0..steps {
        runtime.step();
    }
}

fn runtime_entity(runtime: &RuntimeScene, entity_id: &str) -> RuntimeEntityFrame {
    runtime
        .current_frame()
        .entities
        .into_iter()
        .find(|entity| entity.entity_id == entity_id)
        .expect("entity should exist in frame")
}

fn payload_frame<'a>(
    frame: &'a RuntimeFramePayload,
    entity_id: &str,
) -> &'a sim_core::runtime::RuntimeEntityFrame {
    frame
        .entities
        .iter()
        .find(|entity| entity.entity_id == entity_id)
        .expect("entity should exist in frame")
}

#[test]
fn arc_track_regression_bowl_segment_keeps_ball_attached() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(3.6, 2.0), vector2(2.0, 0.0)),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 30.0,
            end_angle_degrees: 90.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::End,
        },
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 10);
    let frame = runtime_entity(&runtime, "ball");

    assert!((frame.position.sub(center).length() - 2.0).abs() < 5e-2);
    assert!(frame.position.x > 4.0);
    assert!(frame.position.y > 2.0);
}

#[test]
fn arc_track_regression_detaches_when_support_would_need_to_pull() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(4.8, 6.0), vector2(-2.0, 0.0)),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 210.0,
            end_angle_degrees: 270.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::End,
        },
        vector2(0.0, -9.81),
        0.05,
    );

    let first_frame = runtime.step();
    assert!(
        (payload_frame(&first_frame, "ball")
            .position
            .sub(center)
            .length()
            - 2.0)
            .abs()
            < 5e-2
    );

    run_steps(&mut runtime, 5);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.y < 6.0 - 1e-3);
    assert!((frame.position.sub(center).length() - 2.0).abs() > 5e-2);
}

#[test]
fn arc_track_regression_detaches_at_arc_end_and_continues_free_flight() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(3.7, 2.0), vector2(2.8, 0.0)),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 60.0,
            end_angle_degrees: 90.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::End,
        },
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 12);
    let frame = runtime_entity(&runtime, "ball");

    assert!((frame.position.sub(center).length() - 2.0).abs() > 5e-2);
    assert!(frame.velocity.x > 0.0);
}
