import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="container-page flex flex-col gap-2 py-6 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Transcripts are parsed in your browser. Nothing is uploaded unless you run the AI review.
        </p>
        <p className="flex gap-4">
          <Link href="/about#privacy" className="text-muted">Privacy</Link>
          <Link href="/about#pricing" className="text-muted">Pricing table</Link>
          <a href="https://github.com/LiamSDD/agent-scorecard" className="text-muted">Source (MIT)</a>
        </p>
      </div>
    </footer>
  );
}
