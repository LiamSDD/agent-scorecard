// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalRun } from "@/components/local-run";
import { UploadDropzone } from "@/components/upload-dropzone";
import { sampleRun, sampleText } from "../helpers";
import { renderWithStore, router, searchParams } from "./ui-helpers";

vi.mock("next/navigation", async () => {
  const helpers = await import("./ui-helpers");
  return {
    useRouter: () => helpers.router,
    useSearchParams: () => helpers.searchParams.value,
    usePathname: () => "/upload",
  };
});

beforeEach(() => {
  router.push.mockReset();
});

const fileInput = () => screen.getByLabelText("Transcript file") as HTMLInputElement;

describe("UploadDropzone", () => {
  it("states that parsing happens in the browser", () => {
    renderWithStore(<UploadDropzone />);
    expect(screen.getByRole("button", { name: "Choose a file" })).toBeInTheDocument();
    expect(screen.getByText(/up to 50 MB/)).toBeInTheDocument();
  });

  it("shows a clear error for a JSON file that is not a transcript", async () => {
    const user = userEvent.setup();
    renderWithStore(<UploadDropzone />);
    await user.upload(fileInput(), new File(['{"name":"my-app","version":"1.0.0"}'], "package.json", { type: "application/json" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load package.json");
    expect(alert).toHaveTextContent(/does not look like a Claude Code transcript/);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a clear error for a file with no JSON lines", async () => {
    const user = userEvent.setup();
    renderWithStore(<UploadDropzone />);
    await user.upload(fileInput(), new File(["just some notes\nnothing else"], "notes.jsonl"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/None of the lines in this file are valid JSON/);
  });

  it("parses a valid transcript, stores it and navigates to its run view", async () => {
    const user = userEvent.setup();
    renderWithStore(<UploadDropzone />);
    await user.upload(fileInput(), new File([sampleText("clean")], "session.jsonl"));
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(router.push.mock.calls[0][0]).toMatch(/^\/runs\/local\?id=upload-/);
    const list = await screen.findByRole("region", { name: "Uploaded in this tab" });
    expect(within(list).getByText(/session\.jsonl · 16 turns/)).toBeInTheDocument();
  });

  it("accepts dropped files", async () => {
    renderWithStore(<UploadDropzone navigate={false} />);
    const file = new File([sampleText("risky")], "dropped.jsonl");
    const dropzone = screen.getByTestId("dropzone");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(await screen.findByText(/dropped\.jsonl · 15 turns/)).toBeInTheDocument();
  });
});

describe("LocalRun", () => {
  it("explains that uploads are not persisted when the id is unknown", () => {
    searchParams.value = new URLSearchParams("id=missing");
    renderWithStore(<LocalRun />);
    expect(screen.getByRole("heading", { name: "This run is no longer in memory" })).toBeInTheDocument();
  });

  it("renders an uploaded run from the in-memory store", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sharedKey: false }))));
    searchParams.value = new URLSearchParams("id=upload-x");
    renderWithStore(<LocalRun />, [{ id: "upload-x", fileName: "mine.jsonl", run: sampleRun("clean"), addedAt: 0 }]);
    expect(screen.getByText("Uploaded · mine.jsonl")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Automated checks" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
