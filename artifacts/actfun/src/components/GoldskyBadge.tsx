import goldskyLogo from "@/assets/goldsky-logo.svg";

interface GoldskyBadgeProps {
  /** Leading text shown before the Goldsky wordmark. */
  label?: string;
  /** Size of the Goldsky mark + wordmark. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Attribution badge for the Goldsky indexing infrastructure that powers the
 * on-chain activity feeds (Live Feed, price history, funny posts). The wordmark
 * is rendered in Goldsky's brand font (Inter) and brand color (#F34B13).
 */
export default function GoldskyBadge({
  label = "Indexed by",
  size = "sm",
  className = "",
}: GoldskyBadgeProps) {
  const logoSize = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const textSize = size === "md" ? "text-xs" : "text-[11px]";

  return (
    <a
      href="https://goldsky.com"
      target="_blank"
      rel="noopener noreferrer"
      title="On-chain activity indexed by Goldsky — subgraph + Turbo streaming pipeline"
      className={`group inline-flex items-center gap-1.5 transition-opacity hover:opacity-100 ${textSize} ${className}`}
    >
      <span className="text-muted-foreground/70">{label}</span>
      <img
        src={goldskyLogo}
        alt="Goldsky logo"
        className={`${logoSize} shrink-0`}
        draggable={false}
      />
      <span className="goldsky-wordmark text-[#F34B13] group-hover:brightness-110">
        Goldsky
      </span>
    </a>
  );
}
