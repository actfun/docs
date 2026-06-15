import { useState, useEffect, useRef } from "react";

export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  const ref = useRef(seconds);

  useEffect(() => {
    ref.current = seconds;
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      ref.current = Math.max(0, ref.current - 1);
      setRemaining(ref.current);
    }, 1000);
    return () => clearInterval(id);
  }, [remaining > 0]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return {
    remaining,
    display: remaining > 0 ? `${mins}m ${String(secs).padStart(2, "0")}s` : null,
  };
}
