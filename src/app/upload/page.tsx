import type { Metadata } from "next";
import { UploadDropzone } from "@/components/upload-dropzone";

export const metadata: Metadata = { title: "Upload a transcript" };

export default function UploadPage() {
  return (
    <div className="container-page max-w-[760px] py-10">
      <h1 className="text-[24px] font-semibold">Upload a transcript</h1>
      <p className="mt-2 text-[15px] text-muted">
        Your transcript never leaves your browser unless you run the AI review. It is parsed locally, kept in memory for
        this tab only, and discarded when you close or reload it.
      </p>
      <div className="mt-6">
        <UploadDropzone />
      </div>
      <p className="mt-6 text-[13px] text-muted">
        No transcript handy? Download a sample from any sample run page and drop it here.
      </p>
    </div>
  );
}
