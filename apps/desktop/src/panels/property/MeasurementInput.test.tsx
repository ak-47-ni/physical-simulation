import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MeasurementInput } from "./MeasurementInput";

afterEach(() => {
  cleanup();
});

describe("MeasurementInput", () => {
  it("renders a numeric input with a trailing unit suffix", () => {
    render(
      <MeasurementInput
        label="Mass"
        suffix="kg"
        value={1.2}
        onChange={() => undefined}
      />,
    );

    expect((screen.getByLabelText("Mass") as HTMLInputElement).value).toBe("1.2");
    expect(screen.getByText("kg")).toBeDefined();
  });

  it("shows a disabled state and blocks editing", () => {
    const onChange = vi.fn();

    render(
      <MeasurementInput
        disabled
        label="Velocity X"
        suffix="m/s"
        value={4}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Velocity X") as HTMLInputElement;

    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "12" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("forwards numeric changes through the change callback", () => {
    const onChange = vi.fn();

    render(
      <MeasurementInput
        label="Gravity"
        suffix="m/s^2"
        value={9.8}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Gravity"), { target: { value: "12.5" } });

    expect(onChange).toHaveBeenCalledWith(12.5);
  });
});
