import { describe, expect, it } from "vitest";

async function loadVelocityVectorScreenModule() {
  const moduleLoaders = import.meta.glob("./velocityVectorScreen.ts");
  const loadModule = moduleLoaders["./velocityVectorScreen.ts"];

  return loadModule ? await loadModule() : null;
}

describe("velocityVectorScreen", () => {
  it("maps positive authored velocityY to an upward screen vector", async () => {
    const module = await loadVelocityVectorScreenModule();

    expect(module).not.toBeNull();
    expect(module?.mapCartesianVelocityToScreenVector({ velocityX: 0, velocityY: 5 })).toEqual({
      dx: 0,
      dy: -18,
    });
  });

  it("maps negative authored velocityY to a downward screen vector", async () => {
    const module = await loadVelocityVectorScreenModule();

    expect(module).not.toBeNull();
    expect(module?.mapCartesianVelocityToScreenVector({ velocityX: 0, velocityY: -5 })).toEqual({
      dx: 0,
      dy: 18,
    });
  });

  it("keeps velocityX aligned with left-right screen motion", async () => {
    const module = await loadVelocityVectorScreenModule();

    expect(module).not.toBeNull();
    expect(module?.mapCartesianVelocityToScreenVector({ velocityX: 5, velocityY: 0 })).toEqual({
      dx: 18,
      dy: 0,
    });
  });
});
