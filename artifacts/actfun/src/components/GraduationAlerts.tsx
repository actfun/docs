import { useEffect } from "react";
import { useLocation } from "wouter";
import { X, Trophy, Flame } from "lucide-react";
import { useMiningTracker } from "@/context/MiningTrackerContext";
import type { MineAlert } from "@/context/MiningTrackerContext";

const AUTO_DISMISS_MS = 9000;

function AlertToast({ alert, onDismiss }: { alert: MineAlert; onDismiss: () => void }) {
  const [, navigate] = useLocation();

  useEffect(() => {
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [onDismiss]);

  const isGrad = alert.type === "graduated";

  return (
    <div
      className={`flex items-start gap-3 w-80 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-sm cursor-pointer
        slide-in transition-all
        ${isGrad
          ? "bg-emerald-950/90 border-emerald-500/40 hover:border-emerald-400/60"
          : "bg-amber-950/90 border-amber-500/40 hover:border-amber-400/60"
        }`}
      onClick={() => {
        navigate(`/token/${alert.launcherAddress}`);
        onDismiss();
      }}
    >
      <div className={`mt-0.5 shrink-0 ${isGrad ? "text-emerald-400" : "text-amber-400"}`}>
        {isGrad ? <Trophy size={16} /> : <Flame size={16} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`font-bold text-sm ${isGrad ? "text-emerald-300" : "text-amber-300"}`}>
          {isGrad ? "Token Graduated!" : "Almost there! 75% mined."}
        </div>
        <div className="text-xs text-foreground/70 mt-0.5 truncate">
          <span className="font-semibold text-foreground">{alert.tokenName}</span>
          {alert.tokenSymbol ? ` $${alert.tokenSymbol}` : ""}
          {isGrad
            ? " is now trading live on ACTFUN!"
            : " needs your help to cross the finish line."}
        </div>
        <div className={`text-xs mt-1.5 font-medium ${isGrad ? "text-emerald-400" : "text-amber-400"}`}>
          {isGrad ? "View token →" : "Mine now →"}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function GraduationAlerts() {
  const { alerts, dismissAlert } = useMiningTracker();
  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end pointer-events-none">
      {alerts.slice(-3).map((alert) => (
        <div key={alert.id} className="pointer-events-auto">
          <AlertToast alert={alert} onDismiss={() => dismissAlert(alert.id)} />
        </div>
      ))}
    </div>
  );
}
