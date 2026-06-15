import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Rect, Line, Circle } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import type { LaunchEvent } from "@/lib/client";

interface PricePoint {
  time: number;
  price: number;
}

function buildPricePoints(events: LaunchEvent[]): PricePoint[] {
  return events
    .filter((e) => (e.type === "buy" || e.type === "sell") && e.amount && e.arcAmount)
    .map((e) => {
      const tokens = parseFloat(e.amount!);
      const arc = parseFloat(e.arcAmount!);
      return {
        time: e.timestamp,
        price: tokens > 0 ? arc / tokens : 0,
      };
    })
    .filter((p) => p.price > 0)
    .sort((a, b) => a.time - b.time);
}

function buildPolylinePath(
  points: PricePoint[],
  width: number,
  height: number,
  padX: number,
  padY: number
): string {
  if (points.length === 0) return "";

  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const minT = points[0].time;
  const maxT = points[points.length - 1].time;
  const prices = points.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceRange = maxP - minP || 1;
  const timeRange = maxT - minT || 1;

  return points
    .map((p, i) => {
      const x = padX + (i === 0 ? 0 : ((p.time - minT) / timeRange) * innerW);
      const y = padY + innerH - ((p.price - minP) / priceRange) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(
  points: PricePoint[],
  width: number,
  height: number,
  padX: number,
  padY: number
): string {
  if (points.length === 0) return "";

  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const minT = points[0].time;
  const maxT = points[points.length - 1].time;
  const prices = points.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceRange = maxP - minP || 1;
  const timeRange = maxT - minT || 1;

  const bottom = padY + innerH;

  const lineParts = points.map((p, i) => {
    const x = padX + (i === 0 ? 0 : ((p.time - minT) / timeRange) * innerW);
    const y = padY + innerH - ((p.price - minP) / priceRange) * innerH;
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const firstX = padX;
  const lastX = (padX + ((points[points.length - 1].time - minT) / timeRange) * innerW).toFixed(2);

  return (
    lineParts.join(" ") +
    ` L${lastX},${bottom.toFixed(2)} L${firstX.toFixed(2)},${bottom.toFixed(2)} Z`
  );
}

function getLastPoint(
  points: PricePoint[],
  width: number,
  height: number,
  padX: number,
  padY: number
): { x: number; y: number } | null {
  if (points.length === 0) return null;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const minT = points[0].time;
  const maxT = points[points.length - 1].time;
  const prices = points.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const priceRange = maxP - minP || 1;
  const timeRange = maxT - minT || 1;
  const last = points[points.length - 1];
  const x = padX + ((last.time - minT) / timeRange) * innerW;
  const y = padY + innerH - ((last.price - minP) / priceRange) * innerH;
  return { x, y };
}

function formatPrice(p: number): string {
  if (p === 0) return "0";
  if (p < 0.000001) return p.toExponential(2);
  if (p < 0.0001) return p.toFixed(7).replace(/0+$/, "");
  if (p < 0.01) return p.toFixed(5).replace(/0+$/, "");
  return p.toFixed(4).replace(/0+$/, "");
}

interface PriceChartProps {
  events: LaunchEvent[];
  width?: number;
  height?: number;
}

export function PriceChart({ events, width = 340, height = 140 }: PriceChartProps) {
  const colors = useColors();
  const PAD_X = 8;
  const PAD_Y = 12;

  const points = useMemo(() => buildPricePoints(events), [events]);

  const linePath = useMemo(
    () => buildPolylinePath(points, width, height, PAD_X, PAD_Y),
    [points, width, height]
  );

  const areaPath = useMemo(
    () => buildAreaPath(points, width, height, PAD_X, PAD_Y),
    [points, width, height]
  );

  const lastDot = useMemo(
    () => getLastPoint(points, width, height, PAD_X, PAD_Y),
    [points, width, height]
  );

  const prices = points.map((p) => p.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const lastPrice = prices.length ? prices[prices.length - 1] : null;
  const firstPrice = prices.length ? prices[0] : null;
  const priceUp = firstPrice !== null && lastPrice !== null && lastPrice >= firstPrice;

  const lineColor = priceUp ? colors.primary : colors.warning;
  const gradId = "priceGrad";

  if (points.length < 2) {
    return (
      <View style={[styles.emptyWrap, { borderColor: colors.border }]}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No trade data yet — price chart appears after the first buy or sell
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.mutedForeground }]}>Price Chart</Text>
        {lastPrice !== null && (
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.foreground }]}>
              {formatPrice(lastPrice)} USDC
            </Text>
            {firstPrice !== null && firstPrice > 0 && (
              <Text
                style={[
                  styles.change,
                  { color: priceUp ? colors.success : colors.warning },
                ]}
              >
                {priceUp ? "▲" : "▼"}{" "}
                {Math.abs(((lastPrice - firstPrice) / firstPrice) * 100).toFixed(1)}%
              </Text>
            )}
          </View>
        )}
      </View>

      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        <Path d={areaPath} fill={`url(#${gradId})`} />
        <Path
          d={linePath}
          stroke={lineColor}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {lastDot && (
          <>
            <Circle cx={lastDot.x} cy={lastDot.y} r="5" fill={lineColor} opacity="0.3" />
            <Circle cx={lastDot.x} cy={lastDot.y} r="3" fill={lineColor} />
          </>
        )}
      </Svg>

      <View style={styles.footer}>
        <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>
          {formatPrice(minPrice)}
        </Text>
        <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>
          {points.length} trades
        </Text>
        <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>
          {formatPrice(maxPrice)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    padding: 12,
  },
  emptyWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  price: { fontSize: 14, fontWeight: "700" },
  change: { fontSize: 12, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  rangeLabel: { fontSize: 10 },
});
