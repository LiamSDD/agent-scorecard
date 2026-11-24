// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunView } from "@/components/run/run-view";
import { SAMPLE_REVIEWS } from "@/data/samples";
import { readStoredReview } from "@/lib/review/stored";
import { assistantLine, buildRun, sampleRun, toolResult, toolUse, userLine } from "../helpers";
import { renderWithStore, stubFetch } from "./ui-helpers";

beforeEach(() => {
  stubFetch(() => new Response("{}", { status: 500 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function checkRow(id: string) {
  const row = document.querySelector(`[data-check="${id}"]`);
  if (!row) throw new Error(`check ${id} not rendered`);
  return row as HTMLElement;
}

describe("RunView with sample runs", () => {
  it("renders the header stats for the clean sample", () => {
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" />);
    const header = screen.getByRole("region", { name: /customers with a 15% discount code/i });
    expect(within(header).getByText("sonnet-5-5")).toBeInTheDocument();
    expect(within(header).getByText("Turns").nextElementSibling).toHaveTextContent("16");
    expect(within(header).getByText("Cache hit").nextElementSibling).toHaveTextContent("93%");
  });

  it("shows every check passing and a score of 100 for the clean sample", () => {
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" />);
    const checks = screen.getByRole("region", { name: "Automated checks" });
    expect(within(checks).queryAllByText("Fail")).toHaveLength(0);
    expect(within(checks).getAllByText("Pass")).toHaveLength(7);
    expect(screen.getByRole("img", { name: "Hygiene score 100 out of 100" })).toBeInTheDocument();
  });

  it("shows failing checks with evidence for the risky sample", () => {
    renderWithStore(<RunView run={sampleRun("risky")} source="Sample run" />);
    expect(checkRow("destructive-commands")).toHaveAttribute("data-status", "fail");
    expect(checkRow("secrets")).toHaveAttribute("data-status", "fail");
    expect(checkRow("ignored-failures")).toHaveAttribute("data-status", "fail");
    expect(screen.getByRole("img", { name: "Hygiene score 35 out of 100" })).toBeInTheDocument();
    const evidence = within(checkRow("destructive-commands")).getByRole("list", { name: /Evidence for Destructive commands/ });
    expect(within(evidence).getByText("git push --force origin main")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("EXAMPLEonlyNOTaREALkey");
    expect(within(document.getElementById("turn-6") as HTMLElement).getByText(/x-api-key: \[REDACTED\]/)).toBeInTheDocument();
  });

  it("jumps to the cited turn in the timeline when an evidence link is clicked", async () => {
    const user = userEvent.setup();
    renderWithStore(<RunView run={sampleRun("risky")} source="Sample run" />);
    const evidence = within(checkRow("destructive-commands")).getByRole("list", { name: /Evidence/ });
    await user.click(within(evidence).getByRole("link", { name: "Jump to turn T12 in the timeline" }));
    const turn = document.getElementById("turn-11");
    await waitFor(() => expect(document.activeElement).toBe(turn));
    expect(turn).toHaveClass("turn-highlight");
    expect(within(turn as HTMLElement).getByRole("button", { name: "Hide details" })).toBeInTheDocument();
  });

  it("collapses and expands a check", async () => {
    const user = userEvent.setup();
    renderWithStore(<RunView run={sampleRun("risky")} source="Sample run" />);
    const toggle = within(checkRow("secrets")).getByRole("button", { name: /Possible secrets/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("lazy-loads accessible charts", async () => {
    renderWithStore(<RunView run={sampleRun("wasteful")} source="Sample run" />);
    expect(await screen.findByRole("img", { name: /Cumulative cost over the run/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Token mix/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Tool usage/ })).toBeInTheDocument();
  });
});

describe("Timeline", () => {
  it("filters turns by tool type", async () => {
    const user = userEvent.setup();
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" />);
    const timeline = screen.getByRole("region", { name: "Timeline" });
    await user.click(within(timeline).getByRole("button", { name: /^Bash/ }));
    expect(within(timeline).getByRole("button", { name: /^Bash/ })).toHaveAttribute("aria-pressed", "true");
    const turns = within(timeline).getAllByRole("article", { name: /^Turn T/ });
    expect(turns).toHaveLength(5);
    for (const turn of turns) expect(within(turn).getAllByText("Bash").length).toBeGreaterThan(0);
    expect(within(timeline).queryByRole("article", { name: "User prompt" })).not.toBeInTheDocument();
  });

  it("expands a turn to show tool input and result", async () => {
    const user = userEvent.setup();
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" />);
    const turn = document.getElementById("turn-7") as HTMLElement;
    await user.click(within(turn).getByRole("button", { name: "Show details" }));
    expect(within(turn).getByText(/Result \(error\)/)).toBeInTheDocument();
    expect(within(turn).getByText(/expected 16.98 to be 16.99/)).toBeInTheDocument();
  });

  it("hides subagent turns when the toggle is off", async () => {
    const user = userEvent.setup();
    renderWithStore(<RunView run={sampleRun("wasteful")} source="Sample run" />);
    const timeline = screen.getByRole("region", { name: "Timeline" });
    const before = within(timeline).getAllByRole("article", { name: /^Turn T/ }).length;
    await user.click(within(timeline).getByRole("checkbox", { name: "Show subagent turns" }));
    expect(within(timeline).getAllByRole("article", { name: /^Turn T/ })).toHaveLength(before - 9);
  });

  it("renders transcript content as inert text", () => {
    const call = toolUse("Bash", { command: "echo '<script>alert(1)</script>'" });
    const run = buildRun([
      userLine('<img src=x onerror="alert(1)">please'),
      assistantLine([{ type: "text", text: "<b>bold?</b> <a href='javascript:alert(1)'>x</a>" }, call]),
      userLine([toolResult(call.id, "<iframe src=evil></iframe>")]),
    ]);
    const { container } = renderWithStore(<RunView run={run} source="Test" />);
    expect(container.querySelector("img, iframe, script, b")).toBeNull();
    expect(screen.getAllByText(/<img src=x onerror="alert\(1\)">please/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/<b>bold\?<\/b>/).length).toBeGreaterThan(0);
  });
});

describe("AI review panel", () => {
  const stored = readStoredReview(SAMPLE_REVIEWS.clean);

  it("labels committed example reviews and footnotes hand-authored ones", () => {
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" storedReview={stored} />);
    const panel = screen.getByRole("region", { name: "AI review" });
    expect(within(panel).getByText(/Example review \(generated with/)).toBeInTheDocument();
    expect(within(panel).getByText("npm run review:samples", { selector: "code" })).toBeInTheDocument();
    expect(within(panel).getByTestId("review-provenance")).toHaveTextContent(/written by hand.*did not come from the model/);
    expect(within(panel).getByText(stored!.review.verdict)).toBeInTheDocument();
  });

  it("uses a password field with autocomplete off and explains the key handling", () => {
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" />);
    const input = screen.getByLabelText(/Anthropic API key/);
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAccessibleDescription(/never stored or logged/);
    expect(screen.getByRole("button", { name: "Run AI review" })).toBeDisabled();
  });

  it("previews the exact payload without the key", async () => {
    const user = userEvent.setup();
    renderWithStore(<RunView run={sampleRun("risky")} source="Sample run" />);
    await user.type(screen.getByLabelText(/Anthropic API key/), "sk-ant-typed-key");
    await user.click(screen.getByRole("button", { name: "Preview what will be sent" }));
    const payload = screen.getByLabelText("Review request payload");
    expect(payload.textContent).toContain('"schemaVersion": 1');
    expect(payload.textContent).toContain("[REDACTED]");
    expect(payload.textContent).not.toContain("sk-ant-typed-key");
    expect(payload.textContent).not.toContain("EXAMPLEonlyNOTaREALkey");
  });

  it("sends the summary with the key and renders the live review", async () => {
    const user = userEvent.setup();
    const review = stored!.review;
    const fetchMock = stubFetch(
      () => new Response(JSON.stringify({ ok: true, review, model: "claude-opus-5-5", fallbackUsed: false }), { status: 200 }),
    );
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" />);
    await user.type(screen.getByLabelText(/Anthropic API key/), "  sk-ant-typed-key  ");
    await user.click(screen.getByRole("button", { name: "Run AI review" }));
    expect(await screen.findByText("Live review")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body.apiKey).toBe("sk-ant-typed-key");
    expect(body.summary.schemaVersion).toBe(1);
    expect(screen.getByText(review.verdict)).toBeInTheDocument();
  });

  it("shows the server's error message", async () => {
    const user = userEvent.setup();
    stubFetch(() => new Response(JSON.stringify({ ok: false, error: "invalid_key", message: "Anthropic rejected that API key." }), { status: 401 }));
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" />);
    await user.type(screen.getByLabelText(/Anthropic API key/), "bad");
    await user.click(screen.getByRole("button", { name: "Run AI review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Anthropic rejected that API key.");
  });

  it("allows running without a key when the server has a shared key", async () => {
    stubFetch(() => new Response("{}"), true);
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run AI review" })).toBeEnabled());
    expect(screen.getByLabelText(/Anthropic API key \(optional\)/)).toBeInTheDocument();
  });

  it("jumps to turns cited by the review", async () => {
    renderWithStore(<RunView run={sampleRun("clean")} source="Sample run" storedReview={stored} />);
    const cited = screen.getByRole("paragraph", { name: "Turns cited for Communication" });
    await act(async () => {
      fireEvent.click(within(cited).getByText("T14"));
    });
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("turn-13")));
  });
});
