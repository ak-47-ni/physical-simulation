# Text To Physics Scene Design

## Status

Draft for user review.

## Goal

Add a first-phase online AI feature that converts Chinese physics exam-style mechanics prompts into editable, runnable Physics Sandbox scenes.

The first phase is intentionally limited to pure text input. If a question includes a diagram, the user must describe the relevant diagram information in text before generation.

## Non-Goals

- Do not support image/diagram recognition in phase one.
- Do not support electricity, magnetism, optics, heat, wave, or sound problems in phase one.
- Do not let the AI directly mutate the editor state or emit arbitrary `SceneDocument` data.
- Do not attempt to solve the exam problem mathematically as the primary output.

## Supported Phase-One Problem Scope

The generator should focus on classroom mechanics scenes that the current app can already represent:

- Horizontal boards and inclined boards.
- Balls and blocks.
- Gravity.
- Initial velocity.
- Sliding friction.
- Elastic or inelastic collisions through restitution when explicitly stated or inferred.
- Springs between two bodies.
- Arc tracks when the prompt explicitly describes a circular arc track.
- Trajectory visualization for selected generated bodies.

Unsupported content should be reported as a warning instead of silently producing an incorrect scene.

## Recommended Architecture

Use a three-layer pipeline:

1. Prompt understanding by online AI/API.
2. Local validation and normalization into a constrained `SceneDraft`.
3. Local compilation from `SceneDraft` into the existing editor scene state.

The AI only returns structured intent. The app remains responsible for IDs, defaults, dimensions, placement, collision-safe layout, and compatibility with the existing `SceneDocument` schema.

## User Flow

1. User clicks `AI Generate Scene`.
2. A modal opens with a large text area for the exam prompt and any manually described diagram information.
3. User clicks `Generate Draft`.
4. The app calls the online AI/API and asks for strict structured JSON.
5. The app validates the response and shows an "AI understanding preview".
6. The preview lists generated objects, parameters, relationships, assumptions, unsupported parts, and warnings.
7. User chooses `Replace Current Scene`, `Insert Into Current Scene`, or `Cancel`.
8. The generated scene remains fully editable before simulation.

## SceneDraft Contract

The app should introduce a local intermediate data contract such as:

```ts
type SceneDraft = {
  title: string;
  locale: "zh-CN";
  domain: "mechanics";
  gravity?: number;
  entities: SceneDraftEntity[];
  relationships: SceneDraftRelationship[];
  analyzers?: SceneDraftAnalyzer[];
  assumptions: string[];
  warnings: string[];
  unsupported: string[];
};
```

Example:

```json
{
  "title": "粗糙水平面上滑块减速",
  "locale": "zh-CN",
  "domain": "mechanics",
  "gravity": 10,
  "entities": [
    {
      "kind": "board",
      "name": "粗糙水平面",
      "length": 5,
      "angleDegrees": 0,
      "friction": 0.42,
      "locked": true
    },
    {
      "kind": "block",
      "name": "滑块",
      "mass": 1,
      "initialVelocity": { "x": 3, "y": 0 }
    }
  ],
  "relationships": [
    {
      "kind": "place-on",
      "entity": "滑块",
      "target": "粗糙水平面",
      "position": "left"
    }
  ],
  "assumptions": ["题干未给出水平面长度，默认 5 m。"],
  "warnings": [],
  "unsupported": []
}
```

## Validation Rules

The local validator must:

- Reject non-mechanics domains.
- Reject unknown entity and relationship kinds.
- Clamp impossible or dangerous numeric values to safe ranges with warnings.
- Require all object references in relationships to match an entity name.
- Require mass to be positive for movable bodies.
- Require friction to be non-negative.
- Default gravity to the current app default, currently 10 m/s², when omitted.
- Add assumptions for omitted scene dimensions, object positions, or friction values.
- Preserve units as SI values before compiling into editor state.

## Draft-To-Scene Compilation

Compilation should be deterministic:

- Generate stable local entity IDs.
- Create boards as locked rigid bodies by default.
- Place bodies using existing authoring placement and snapping rules where possible.
- Avoid initial overlaps.
- Convert `place-on` relationships into coordinates using board geometry.
- Convert `spring-between` relationships into existing spring constraints.
- Convert explicit `show-trajectory` requests into existing trajectory analyzers.
- Create gravity through the existing scene force source path.

The compiler should return both the editor state patch and a summary of any defaults it applied.

## UI Requirements

The modal should include:

- Prompt text area.
- Optional small helper text: "If the question has a diagram, describe the diagram here."
- Generate button with loading/error state.
- Understanding preview before applying changes.
- Object/parameter list.
- Assumptions and warnings section.
- `Replace Current Scene`, `Insert Into Current Scene`, and `Cancel` actions.

The UI should not hide warnings. A generated scene with warnings may still be applied, but unsupported content should be visible before confirmation.

## API Boundary

Create a frontend service module responsible for:

- Building the AI request.
- Calling the configured provider.
- Parsing JSON output.
- Returning a raw draft candidate.

Provider-specific details should stay isolated so the app can later switch between OpenAI-compatible APIs, local proxy services, or other model providers.

API keys should not be hardcoded into the frontend source. The desktop shell should read them from environment/config or a future settings screen.

## Initial Provider Decision

Use OpenAI as the first online AI provider.

The first implementation should call the OpenAI Responses API from the Tauri/Rust side, not directly from the frontend, so the API key is not exposed to browser code. Use Structured Outputs with a strict JSON Schema for `SceneDraft` so the model returns predictable, locally validatable data instead of free-form text.

Recommended configuration shape:

```txt
AI_PROVIDER=openai
OPENAI_API_KEY=<runtime secret>
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.4-mini
```

Recommended model policy:

- Default to `gpt-5.4-mini` for normal exam prompt extraction to control latency and cost.
- Allow switching to `gpt-5.5` for longer or more ambiguous mechanics problems.
- Keep the provider boundary narrow enough that another OpenAI-compatible service can be added later, but do not optimize phase one around multi-provider support.

The app should show a clear configuration error when the API key is missing, billing/quota is unavailable, the request is rejected, or the model returns a refusal instead of a draft.

## Error Handling

The feature should handle:

- Missing API configuration.
- Network failure.
- Non-JSON AI output.
- JSON that does not match `SceneDraft`.
- Unsupported problem domain.
- Ambiguous prompt with too many missing physical conditions.

Errors should be shown in the modal and should not alter the current scene.

## Testing Strategy

Add unit tests for:

- SceneDraft validation.
- Draft-to-scene compilation.
- Relationship reference resolution.
- Defaults and warnings.
- Rejection of unsupported domains.

Add UI tests for:

- Opening the modal.
- Generating a draft through a mocked AI service.
- Showing assumptions and warnings.
- Replacing the current scene.
- Cancelling without scene changes.

Add integration-style tests with fixed mock prompts:

- Block sliding on rough horizontal board.
- Ball rolling or moving on a board with initial velocity.
- Two balls colliding.
- Two bodies connected by a spring on a board.
- Arc track connected to a board.

## Versioning

When implementation starts, increment the desktop app version for each completed functional change, following the existing project convention.

## Open Decisions Before Implementation

- Whether API calls should happen directly from the Tauri frontend or through Rust commands.
- Whether generated scene history should be stored for replay/debugging.
- Whether the first implementation should support "Insert Into Current Scene" or only "Replace Current Scene".
