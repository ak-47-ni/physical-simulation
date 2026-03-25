import { describe, expect, it } from "vitest";

import {
  authoringVelocityToRuntime,
  runtimeVelocityToAuthoring,
} from "./velocitySemantics";

describe("velocitySemantics", () => {
  it("converts authored cartesian velocity into runtime screen-down velocity", () => {
    expect(authoringVelocityToRuntime({ velocityX: 2.5, velocityY: 4 })).toEqual({
      velocityX: 2.5,
      velocityY: -4,
    });
  });

  it("converts runtime screen-down velocity back into authored cartesian velocity", () => {
    expect(runtimeVelocityToAuthoring({ velocityX: -1.25, velocityY: -3.5 })).toEqual({
      velocityX: -1.25,
      velocityY: 3.5,
    });
  });
});
