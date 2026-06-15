interface MinepadLogoProps {
  size?: number;
  className?: string;
  withBackground?: boolean;
  withWordmark?: boolean;
  title?: string;
}

export function MinepadLogo({
  size = 40,
  className,
  withBackground = false,
  withWordmark = false,
  title = "ACTFUN",
}: MinepadLogoProps) {
  return (
    <img
      src="/actfun-logo.jpg"
      alt={title}
      width={size}
      height={size}
      className={className}
      style={{
        objectFit: "contain",
        borderRadius: "50%",
        background: withBackground ? "#000" : undefined,
      }}
      loading="eager"
    />
  );
}

export default MinepadLogo;
