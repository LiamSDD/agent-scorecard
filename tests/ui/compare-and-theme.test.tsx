// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CompareView, type CompareOption } from "@/components/compare-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_STORAGE_KEY } from "@/components/theme-script";
import { sampleRun } from "../helpers";
import { renderWithStore } from "./ui-helpers";

const options: CompareOption[] = (["clean", "risky", "wasteful"] as const).map((id) => ({
  id,
  label: `Sample: ${id}`,
  href: `/runs/${id}`,
  run: sampleRun(id),
}));

describe("CompareView", () => {
  it("shows metrics and checks side by side for two runs", () => {
    renderWithStore(<CompareView samples={options} />);
    const metrics = screen.getByRole("table", { name: /Key metrics/ });
    const scoreRow = within(metrics).getByRole("row", { name: /Hygiene score/ });
    expect(scoreRow).toHaveTextContent("100 / 100");
    expect(scoreRow).toHaveTextContent("35 / 100");
    expect(within(scoreRow).getAllByText("better")).toHaveLength(1);
    const checks = screen.getByRole("table", { name: "Automated checks" });
    const destructive = within(checks).getByRole("row", { name: /Destructive commands/ });
    expect(within(destructive).getByText("Pass")).toBeInTheDocument();
    expect(within(destructive).getByText("Fail")).toBeInTheDocument();
  });

  it("switches runs and includes uploaded runs as options", async () => {
    const user = userEvent.setup();
    renderWithStore(<CompareView samples={options} />, [{ id: "upload-1", fileName: "mine.jsonl", run: sampleRun("wasteful"), addedAt: 0 }]);
    const pickerB = screen.getByLabelText("Run B");
    expect(within(pickerB).getByRole("option", { name: "Uploaded: mine.jsonl" })).toBeInTheDocument();
    await user.selectOptions(pickerB, "upload-1");
    const metrics = screen.getByRole("table", { name: /Key metrics/ });
    expect(within(metrics).getByRole("row", { name: /Subagents/ })).toHaveTextContent("3");
  });
});

describe("ThemeToggle", () => {
  it("switches the theme attribute and remembers the choice", async () => {
    const user = userEvent.setup();
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
