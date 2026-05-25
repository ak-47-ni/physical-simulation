# Goal: Stable AI Physics Scene Generation

## Long-Term Objective

Continuously improve the current project so AI-generated middle-school physics scenes are accurate, stable, verifiable, runnable, and useful for classroom teaching.

The target behavior is:

- Common simple mechanics prompts generate understandable and runnable scenes.
- The same prompt, model configuration, seed, and project version produce the same scene structure.
- Generated scenes preserve the physics meaning: object count, object types, core parameters, constraints, relationships, and initial states must not drift randomly.
- Failure cases produce actionable errors, safe degradation, or recoverable drafts instead of silent incorrect scenes.

## Priority Scene Scope

Start with simple mechanics scenes before expanding complexity:

- Single-object motion: free fall, uniform straight-line motion, block sliding on an incline.
- Two-object relationships: collision, spring connection, pulley, lever.
- Basic mechanics forces: gravity, friction, elasticity, buoyancy.
- Electricity can be deferred.

Teacher-facing natural-language prompts should produce editable, reproducible scenes.

## Execution Phases

1. Understand the current architecture and AI scene-generation path.
2. Establish a schema-aware baseline prompt test set.
3. Improve simple-scene generation success rate.
4. Improve deterministic output for repeated identical inputs.
5. Improve error handling, logging, fallback, and explainability.
6. Document developer workflow and teacher-facing usage notes.

## Working Rules

- Make small, verifiable changes per round.
- Explain the round goal before edits and summarize actual changes after edits.
- Run relevant validation after each modification.
- Prefer root-cause fixes over patches that only hide errors.
- Do not hardcode a single sample just to pass tests unless clearly marked as a temporary baseline.
- Do not claim unsupported project capabilities.
- Pause before reading secrets, deleting files, moving many files, changing global environment, installing global dependencies, pushing code, deploying, modifying production data, registering/logging into paid services, or changing the core architecture.

## Round Output Format

Each round should report:

1. Current goal
2. Findings
3. Changes
4. Verification method
5. Verification result
6. Current risks
7. Recommended next round

