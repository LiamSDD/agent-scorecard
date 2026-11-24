import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-16">
      <h1 className="text-[24px] font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">That run or page does not exist.</p>
      <p className="mt-6 flex gap-3">
        <Link href="/" className="btn btn-primary">Home</Link>
        <Link href="/upload" className="btn">Upload a transcript</Link>
      </p>
    </div>
  );
}
