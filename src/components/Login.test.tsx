import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Login } from "./Login";

describe("Login", () => {
  it("validates required credentials accessibly", () => { render(<Login onSubmit={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: "Sign in" })); expect(screen.getByRole("alert")).toHaveTextContent("email"); });
  it("calls submit with credentials", async () => { const submit = vi.fn(() => Promise.resolve()); render(<Login onSubmit={submit} />); fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@example.com" } }); fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } }); fireEvent.click(screen.getByRole("button", { name: "Sign in" })); await waitFor(() => expect(submit).toHaveBeenCalledWith("demo@example.com", "password")); });
  it("renders API errors", () => { render(<Login error="Credenciales inválidas." onSubmit={vi.fn()} />); expect(screen.getByRole("alert")).toHaveTextContent("Credenciales inválidas"); });
});
