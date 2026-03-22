use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vector2 {
    pub x: f64,
    pub y: f64,
}

impl Vector2 {
    pub const ZERO: Self = Self { x: 0.0, y: 0.0 };

    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn add(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y)
    }

    pub fn sub(self, other: Self) -> Self {
        Self::new(self.x - other.x, self.y - other.y)
    }

    pub fn scale(self, factor: f64) -> Self {
        Self::new(self.x * factor, self.y * factor)
    }

    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y
    }

    pub fn length(self) -> f64 {
        self.dot(self).sqrt()
    }

    pub fn normalized(self) -> Self {
        let length = self.length();

        if length <= f64::EPSILON {
            Self::ZERO
        } else {
            self.scale(1.0 / length)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ShapeDefinition {
    Ball { radius: f64 },
    Block { width: f64, height: f64 },
    ConvexPolygon { points: Vec<Vector2> },
    Unsupported { kind: String },
}

impl ShapeDefinition {
    pub fn kind_name(&self) -> &str {
        match self {
            Self::Ball { .. } => "ball",
            Self::Block { .. } => "block",
            Self::ConvexPolygon { .. } => "convex-polygon",
            Self::Unsupported { kind } => kind.as_str(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EntityDefinition {
    pub id: String,
    pub shape: ShapeDefinition,
    pub position: Vector2,
    pub rotation_radians: f64,
    pub initial_velocity: Vector2,
    pub mass: f64,
    pub is_static: bool,
    pub friction_coefficient: f64,
    pub restitution_coefficient: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CompiledShape {
    Ball { radius: f64 },
    Block { width: f64, height: f64 },
    ConvexPolygon { points: Vec<Vector2> },
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompiledEntity {
    pub id: String,
    pub shape: CompiledShape,
    pub position: Vector2,
    pub rotation_radians: f64,
    pub initial_velocity: Vector2,
    pub mass: f64,
    pub is_static: bool,
    pub friction_coefficient: f64,
    pub restitution_coefficient: f64,
}

fn cross(origin: Vector2, a: Vector2, b: Vector2) -> f64 {
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

pub fn is_convex_polygon(points: &[Vector2]) -> bool {
    if points.len() < 3 {
        return false;
    }

    let mut sign = 0.0;

    for index in 0..points.len() {
        let current = points[index];
        let next = points[(index + 1) % points.len()];
        let next_next = points[(index + 2) % points.len()];
        let z = cross(current, next, next_next);

        if z == 0.0 {
            continue;
        }

        if sign == 0.0 {
            sign = z.signum();
            continue;
        }

        if z.signum() != sign {
            return false;
        }
    }

    true
}
