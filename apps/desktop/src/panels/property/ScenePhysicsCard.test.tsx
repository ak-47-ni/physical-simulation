import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScenePhysicsCard } from "./ScenePhysicsCard";

afterEach(() => {
  cleanup();
});

function renderScenePhysicsCard(
  overrides: Partial<Parameters<typeof ScenePhysicsCard>[0]> = {},
) {
  const onGravityChange = vi.fn();
  const onLengthUnitChange = vi.fn();
  const onVelocityUnitChange = vi.fn();
  const onMassUnitChange = vi.fn();
  const onPixelsPerMeterChange = vi.fn();

  render(
    <ScenePhysicsCard
      gravity={9.8}
      gravityUnitLabel="m/s²"
      lengthUnit="m"
      lengthUnitOptions={["m", "cm"]}
      lockReason={null}
      massUnit="kg"
      massUnitOptions={["kg", "g"]}
      pixelsPerMeter={100}
      velocityUnit="m/s"
      velocityUnitOptions={["m/s", "cm/s"]}
      onGravityChange={onGravityChange}
      onLengthUnitChange={onLengthUnitChange}
      onMassUnitChange={onMassUnitChange}
      onPixelsPerMeterChange={onPixelsPerMeterChange}
      onVelocityUnitChange={onVelocityUnitChange}
      {...overrides}
    />,
  );

  return {
    onGravityChange,
    onLengthUnitChange,
    onMassUnitChange,
    onPixelsPerMeterChange,
    onVelocityUnitChange,
  };
}

describe("ScenePhysicsCard", () => {
  it("shows gravity, unit selectors, and the world-scale control", () => {
    renderScenePhysicsCard();

    expect((screen.getByLabelText("Gravity") as HTMLInputElement).value).toBe("9.8");
    expect(screen.getByText("m/s²")).toBeDefined();
    expect((screen.getByLabelText("Length unit") as HTMLSelectElement).value).toBe("m");
    expect((screen.getByLabelText("Velocity unit") as HTMLSelectElement).value).toBe("m/s");
    expect((screen.getByLabelText("Mass unit") as HTMLSelectElement).value).toBe("kg");
    expect((screen.getByLabelText("Pixels per meter") as HTMLInputElement).value).toBe("100");
  });

  it("disables every control and shows lock guidance while authoring is locked", () => {
    renderScenePhysicsCard({
      disabled: true,
      lockReason: "Scene physics is locked while runtime is playing.",
    });

    expect(screen.getByText("Scene physics is locked while runtime is playing.")).toBeDefined();
    expect((screen.getByLabelText("Gravity") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Length unit") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Velocity unit") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Mass unit") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Pixels per meter") as HTMLInputElement).disabled).toBe(true);
  });

  it("routes gravity, unit, and world-scale changes through callbacks", () => {
    const callbacks = renderScenePhysicsCard();

    fireEvent.change(screen.getByLabelText("Gravity"), { target: { value: "12.5" } });
    fireEvent.change(screen.getByLabelText("Length unit"), { target: { value: "cm" } });
    fireEvent.change(screen.getByLabelText("Velocity unit"), { target: { value: "cm/s" } });
    fireEvent.change(screen.getByLabelText("Mass unit"), { target: { value: "g" } });
    fireEvent.change(screen.getByLabelText("Pixels per meter"), { target: { value: "160" } });

    expect(callbacks.onGravityChange).toHaveBeenCalledWith(12.5);
    expect(callbacks.onLengthUnitChange).toHaveBeenCalledWith("cm");
    expect(callbacks.onVelocityUnitChange).toHaveBeenCalledWith("cm/s");
    expect(callbacks.onMassUnitChange).toHaveBeenCalledWith("g");
    expect(callbacks.onPixelsPerMeterChange).toHaveBeenCalledWith(160);
  });
});
