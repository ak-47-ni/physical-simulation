import { describe, expect, it } from "vitest";

import { desktopAppId } from "./app-meta";

describe("desktop app metadata", () => {
  it("exposes a stable desktop app id", () => {
    expect(desktopAppId).toBe("physics-sandbox-desktop");
  });
});
