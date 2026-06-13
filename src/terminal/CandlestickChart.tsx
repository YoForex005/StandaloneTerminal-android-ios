import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fonts } from './theme';

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Props = {
  data: Candle[];
  width: number;
  height: number;
  decimals?: number;
  visualType?: ChartVisualType;
  priceSource?: ChartPriceSource;
  spread?: number;
  showVolume?: boolean;
  activeIndicators?: ChartIndicator[];
  objects?: ChartObject[];
  onObjectsChange?: (objects: ChartObject[]) => void;
  alerts?: ChartPriceAlert[];
};

export type ChartVisualType = 'candles' | 'bars' | 'line' | 'hollow';
export type ChartPriceSource = 'bid' | 'ask' | 'mid';
export type ChartIndicator = 'MA' | 'Bollinger' | 'RSI';
export type ChartObjectKind = 'trend' | 'horizontal' | 'rectangle' | 'text';
export type ChartAnchor = {
  time: number;
  price: number;
};
export type ChartObject = {
  id: string;
  kind: ChartObjectKind;
  label: string;
  p1?: ChartAnchor;
  p2?: ChartAnchor;
  hidden?: boolean;
  locked?: boolean;
};
export type ChartPriceAlert = {
  id: string;
  price: number;
  direction: 'above' | 'below';
};

const DEFAULT_VISIBLE_CANDLES = 20;
const MIN_VISIBLE_CANDLES = 1;
const CHART_PAD_LEFT = 8;
const CHART_PAD_RIGHT = 56;
const CHART_RIGHT_SHIFT_GAP = 42;
const DRAWING_HIT_RADIUS = 16;
const DRAWING_HANDLE_RADIUS = 5;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getPinchDistance = (event: GestureResponderEvent) => {
  const touches = event.nativeEvent.touches;
  if (touches.length < 2) return null;
  const [a, b] = touches;
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
};

const buildPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
};

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

const distanceToSegment = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
};

export const CandlestickChart = React.memo(({
  data,
  width,
  height,
  decimals = 4,
  visualType = 'candles',
  priceSource = 'mid',
  spread = 0,
  showVolume = false,
  activeIndicators = [],
  objects = [],
  onObjectsChange,
  alerts = [],
}: Props) => {
  const defaultVisible = Math.min(DEFAULT_VISIBLE_CANDLES, data.length);
  const minVisible = Math.min(MIN_VISIBLE_CANDLES, Math.max(1, data.length));
  const [visibleCount, setVisibleCount] = useState(defaultVisible);
  const [rightOffset, setRightOffset] = useState(0);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const gestureStartVisibleRef = useRef(defaultVisible);
  const gestureStartOffsetRef = useRef(0);
  const gestureStartDistanceRef = useRef<number | null>(null);
  const objectGestureRef = useRef<{
    id: string;
    target: 'p1' | 'p2' | 'body';
    startX: number;
    startY: number;
    startPrice: number;
    original: ChartObject;
  } | null>(null);

  useEffect(() => {
    setVisibleCount(defaultVisible);
    setRightOffset(0);
  }, [data.length, defaultVisible]);

  const viewport = useMemo(() => {
    const count = clamp(Math.round(visibleCount), minVisible, Math.max(minVisible, data.length));
    const offset = clamp(Math.round(rightOffset), 0, Math.max(0, data.length - count));
    const end = data.length - offset;
    const start = Math.max(0, end - count);
    return {
      data: data.slice(start, end),
      count,
      offset,
      start,
      end,
    };
  }, [data, minVisible, rightOffset, visibleCount]);

  const layout = useMemo(() => {
    if (viewport.data.length === 0 || width <= 0 || height <= 0) return null;

    const sourceOffset = priceSource === 'ask' ? spread / 2 : priceSource === 'bid' ? -spread / 2 : 0;
    const chartData = viewport.data.map((candle) => ({
      ...candle,
      open: candle.open + sourceOffset,
      high: candle.high + sourceOffset,
      low: candle.low + sourceOffset,
      close: candle.close + sourceOffset,
    }));
    const padTop = 12;
    const padBottom = 24;
    const volumePaneH = showVolume ? 46 : 0;
    const plotEndX = width - CHART_PAD_RIGHT;
    const usableW = Math.max(1, plotEndX - CHART_PAD_LEFT - CHART_RIGHT_SHIFT_GAP);
    const usableH = Math.max(1, height - padTop - padBottom - volumePaneH);
    const max = Math.max(...chartData.map((candle) => candle.high));
    const min = Math.min(...chartData.map((candle) => candle.low));
    const range = max - min || 1;
    const paddedMax = max + range * 0.05;
    const paddedMin = min - range * 0.05;
    const paddedRange = paddedMax - paddedMin;
    const candleSlot = usableW / chartData.length;
    const candleW = Math.max(3, Math.min(12, candleSlot * 0.68));
    const yFor = (price: number) => padTop + ((paddedMax - price) / paddedRange) * usableH;
    const xFor = (index: number) => CHART_PAD_LEFT + index * candleSlot + candleSlot / 2;
    const indexForTime = (time: number) => {
      const exact = data.findIndex((candle) => candle.time === time);
      if (exact >= 0) return exact;
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      data.forEach((candle, index) => {
        const nextDistance = Math.abs(candle.time - time);
        if (nextDistance < nearestDistance) {
          nearest = index;
          nearestDistance = nextDistance;
        }
      });
      return nearest;
    };
    const xForTime = (time: number) => CHART_PAD_LEFT + (indexForTime(time) - viewport.start) * candleSlot + candleSlot / 2;
    const timeForX = (x: number) => {
      const index = clamp(Math.round(viewport.start + (x - CHART_PAD_LEFT) / candleSlot - 0.5), 0, data.length - 1);
      return data[index]?.time ?? chartData[chartData.length - 1].time;
    };
    const priceForY = (y: number) => paddedMax - ((y - padTop) / usableH) * paddedRange - sourceOffset;
    const yForObjectPrice = (price: number) => yFor(price + sourceOffset);
    const maxVolume = Math.max(...chartData.map((candle) => candle.volume), 1);
    const volumeTop = padTop + usableH + 10;
    const volumeBottom = height - padBottom + 5;

    const closes = chartData.map((candle) => candle.close);
    const maPoints = activeIndicators.includes('MA')
      ? closes.map((_, index) => {
          const slice = closes.slice(Math.max(0, index - 13), index + 1);
          return { x: xFor(index), y: yFor(average(slice)) };
        })
      : [];
    const bollinger = activeIndicators.includes('Bollinger')
      ? closes.map((_, index) => {
          const slice = closes.slice(Math.max(0, index - 19), index + 1);
          const mid = average(slice);
          const variance = average(slice.map((value) => Math.pow(value - mid, 2)));
          const deviation = Math.sqrt(variance);
          return {
            x: xFor(index),
            upper: yFor(mid + deviation * 2),
            lower: yFor(mid - deviation * 2),
          };
        })
      : [];
    const rsiPoints = activeIndicators.includes('RSI')
      ? closes.map((close, index) => {
          if (index === 0) return { x: xFor(index), y: volumeTop + 18 };
          const slice = closes.slice(Math.max(1, index - 13), index + 1);
          let gains = 0;
          let losses = 0;
          slice.forEach((value, localIndex) => {
            const previous = closes[Math.max(0, index - slice.length + localIndex)];
            const diff = value - previous;
            if (diff >= 0) gains += diff;
            else losses += Math.abs(diff);
          });
          const rs = gains / Math.max(losses, 0.0000001);
          const rsi = 100 - 100 / (1 + rs);
          return { x: xFor(index), y: volumeTop + (1 - rsi / 100) * Math.max(22, volumeBottom - volumeTop) };
        })
      : [];

    return {
      candles: chartData.map((candle, index) => {
        const x = CHART_PAD_LEFT + index * candleSlot + (candleSlot - candleW) / 2;
        const isBull = candle.close >= candle.open;
        const bodyTop = yFor(Math.max(candle.open, candle.close));
        const bodyBottom = yFor(Math.min(candle.open, candle.close));
        return {
          x,
          candleW,
          bodyTop,
          bodyHeight: Math.max(1, bodyBottom - bodyTop),
          wickTop: yFor(candle.high),
          wickBottom: yFor(candle.low),
          wickX: x + candleW / 2,
          isBull,
          openY: yFor(candle.open),
          closeY: yFor(candle.close),
          highY: yFor(candle.high),
          lowY: yFor(candle.low),
          volumeH: Math.max(1, (candle.volume / maxVolume) * Math.max(1, volumeBottom - volumeTop)),
        };
      }),
      gridLines: Array.from({ length: 5 }, (_, index) => {
        const ratio = index / 4;
        return {
          y: padTop + ratio * usableH,
          price: paddedMax - ratio * paddedRange,
        };
      }),
      lastCandle: chartData[chartData.length - 1],
      lastY: yFor(chartData[chartData.length - 1].close),
      bidY: yFor(chartData[chartData.length - 1].close - spread / 2),
      askY: yFor(chartData[chartData.length - 1].close + spread / 2),
      plotEndX,
      linePath: buildPath(chartData.map((candle, index) => ({ x: xFor(index), y: yFor(candle.close) }))),
      maPath: buildPath(maPoints),
      bollingerUpperPath: buildPath(bollinger.map((point) => ({ x: point.x, y: point.upper }))),
      bollingerLowerPath: buildPath(bollinger.map((point) => ({ x: point.x, y: point.lower }))),
      rsiPath: buildPath(rsiPoints),
      alertLines: alerts.map((alert) => ({ ...alert, y: yFor(alert.price + sourceOffset) })),
      objectShapes: objects
        .filter((object) => !object.hidden && object.p1)
        .map((object) => {
          const p1 = object.p1
            ? { ...object.p1, x: xForTime(object.p1.time), y: yForObjectPrice(object.p1.price) }
            : null;
          const p2 = object.p2
            ? { ...object.p2, x: xForTime(object.p2.time), y: yForObjectPrice(object.p2.price) }
            : null;
          return { object, p1, p2 };
        }),
      candleSlot,
      indexForTime,
      timeForX,
      priceForY,
      xForTime,
      yForObjectPrice,
      volumeTop,
      volumeBottom,
    };
  }, [activeIndicators, alerts, data, height, objects, priceSource, showVolume, spread, viewport.data, viewport.start, width]);

  const panResponder = useMemo(
    () => {
      const eventPoint = (event: GestureResponderEvent) => ({
        x: event.nativeEvent.locationX,
        y: event.nativeEvent.locationY,
      });

      const hitTest = (point: { x: number; y: number }) => {
        if (!layout) return null;
        for (let index = layout.objectShapes.length - 1; index >= 0; index--) {
          const shape = layout.objectShapes[index];
          const { object, p1, p2 } = shape;
          if (!p1 || object.locked) continue;

          if (selectedObjectId === object.id) {
            if (distance(point, p1) <= DRAWING_HIT_RADIUS) return { object, target: 'p1' as const };
            if (p2 && distance(point, p2) <= DRAWING_HIT_RADIUS) return { object, target: 'p2' as const };
          }

          if (object.kind === 'horizontal' && Math.abs(point.y - p1.y) <= DRAWING_HIT_RADIUS) {
            return { object, target: 'body' as const };
          }
          if (object.kind === 'text' && distance(point, p1) <= DRAWING_HIT_RADIUS * 2) {
            return { object, target: 'body' as const };
          }
          if ((object.kind === 'trend' || object.kind === 'rectangle') && p2) {
            if (object.kind === 'trend' && distanceToSegment(point, p1, p2) <= DRAWING_HIT_RADIUS) {
              return { object, target: 'body' as const };
            }
            if (object.kind === 'rectangle') {
              const left = Math.min(p1.x, p2.x);
              const right = Math.max(p1.x, p2.x);
              const top = Math.min(p1.y, p2.y);
              const bottom = Math.max(p1.y, p2.y);
              const onEdge =
                point.x >= left - DRAWING_HIT_RADIUS &&
                point.x <= right + DRAWING_HIT_RADIUS &&
                point.y >= top - DRAWING_HIT_RADIUS &&
                point.y <= bottom + DRAWING_HIT_RADIUS &&
                (Math.abs(point.x - left) <= DRAWING_HIT_RADIUS ||
                  Math.abs(point.x - right) <= DRAWING_HIT_RADIUS ||
                  Math.abs(point.y - top) <= DRAWING_HIT_RADIUS ||
                  Math.abs(point.y - bottom) <= DRAWING_HIT_RADIUS);
              const inside = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
              if (onEdge || inside) return { object, target: 'body' as const };
            }
          }
        }
        return null;
      };

      const updateObject = (updated: ChartObject) => {
        onObjectsChange?.(objects.map((object) => (object.id === updated.id ? updated : object)));
      };

      const shiftAnchor = (anchor: ChartAnchor, deltaIndex: number, priceDelta: number) => {
        const index = layout
          ? clamp(layout.indexForTime(anchor.time) + deltaIndex, 0, data.length - 1)
          : 0;
        return {
          time: data[index]?.time ?? anchor.time,
          price: anchor.price + priceDelta,
        };
      };

      return PanResponder.create({
        onStartShouldSetPanResponder: (event) => {
          if (event.nativeEvent.touches.length >= 2) return true;
          return !!hitTest(eventPoint(event));
        },
        onStartShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponder: (event, gesture) => {
          if (event.nativeEvent.touches.length >= 2) return true;
          return !!hitTest(eventPoint(event)) || Math.abs(gesture.dx) > 8;
        },
        onMoveShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length >= 2,
        onPanResponderGrant: (event) => {
          gestureStartVisibleRef.current = viewport.count;
          gestureStartOffsetRef.current = viewport.offset;
          gestureStartDistanceRef.current = getPinchDistance(event);
          objectGestureRef.current = null;

          const hit = event.nativeEvent.touches.length >= 2 ? null : hitTest(eventPoint(event));
          if (hit && layout) {
            const point = eventPoint(event);
            setSelectedObjectId(hit.object.id);
            objectGestureRef.current = {
              id: hit.object.id,
              target: hit.target,
              startX: point.x,
              startY: point.y,
              startPrice: layout.priceForY(point.y),
              original: hit.object,
            };
          } else if (event.nativeEvent.touches.length < 2) {
            setSelectedObjectId(null);
          }
        },
        onPanResponderMove: (event, gesture) => {
          if (data.length <= 1) return;

          const objectGesture = objectGestureRef.current;
          if (objectGesture && layout) {
            const point = eventPoint(event);
            const original = objectGesture.original;
            const nextPrice = layout.priceForY(point.y);
            const priceDelta = nextPrice - objectGesture.startPrice;
            const deltaIndex = Math.round((point.x - objectGesture.startX) / layout.candleSlot);

            if (objectGesture.target === 'body') {
              const next: ChartObject = {
                ...original,
                p1: original.p1 ? shiftAnchor(original.p1, deltaIndex, priceDelta) : original.p1,
                p2: original.p2 ? shiftAnchor(original.p2, deltaIndex, priceDelta) : original.p2,
              };
              updateObject(next);
              return;
            }

            const movedAnchor = {
              time: layout.timeForX(point.x),
              price: nextPrice,
            };
            if (original.kind === 'horizontal') {
              updateObject({ ...original, p1: { ...(original.p1 ?? movedAnchor), price: nextPrice } });
              return;
            }
            updateObject({
              ...original,
              [objectGesture.target]: movedAnchor,
            });
            return;
          }

          const distance = getPinchDistance(event);
          if (distance) {
            const startDistance = gestureStartDistanceRef.current ?? distance;
            if (!gestureStartDistanceRef.current) gestureStartDistanceRef.current = distance;
            const nextVisible = clamp(
              Math.round(gestureStartVisibleRef.current * (startDistance / distance)),
              minVisible,
              data.length,
            );
            const centerIndex =
              data.length - gestureStartOffsetRef.current - gestureStartVisibleRef.current / 2;
            setVisibleCount(nextVisible);
            setRightOffset(
              clamp(
                Math.round(data.length - centerIndex - nextVisible / 2),
                0,
                Math.max(0, data.length - nextVisible),
              ),
            );
            return;
          }

          gestureStartDistanceRef.current = null;
          const usableW = Math.max(1, width - CHART_PAD_LEFT - CHART_PAD_RIGHT - CHART_RIGHT_SHIFT_GAP);
          const candleSlot = usableW / Math.max(1, gestureStartVisibleRef.current);
          setRightOffset(
            clamp(
              gestureStartOffsetRef.current + Math.round(gesture.dx / candleSlot),
              0,
              Math.max(0, data.length - viewport.count),
            ),
          );
        },
        onPanResponderRelease: () => {
          gestureStartDistanceRef.current = null;
          objectGestureRef.current = null;
        },
        onPanResponderTerminate: () => {
          gestureStartDistanceRef.current = null;
          objectGestureRef.current = null;
        },
      });
    },
    [data, layout, minVisible, objects, onObjectsChange, selectedObjectId, viewport.count, viewport.offset, width],
  );

  if (!layout) return null;

  return (
    <View style={{ width, height }} {...panResponder.panHandlers}>
      <Svg width={width} height={height}>
        {layout.gridLines.map((grid, index) => (
          <G key={`grid-${index}`}>
            <Line
              x1={CHART_PAD_LEFT}
              x2={layout.plotEndX}
              y1={grid.y}
              y2={grid.y}
              stroke={colors.line}
              strokeWidth={StyleSheet.hairlineWidth}
              strokeDasharray="2 4"
            />
            <SvgText
              x={width - 4}
              y={grid.y + 3}
              fontSize={10}
              fontFamily={fonts.mono}
              fill={colors.inkMuted}
              textAnchor="end"
            >
              {grid.price.toFixed(decimals)}
            </SvgText>
          </G>
        ))}

        {showVolume ? (
          <G opacity={0.62}>
            <Line
              x1={CHART_PAD_LEFT}
              x2={layout.plotEndX}
              y1={layout.volumeTop - 5}
              y2={layout.volumeTop - 5}
              stroke={colors.lineSoft}
              strokeWidth={StyleSheet.hairlineWidth}
            />
            {layout.candles.map((candle, index) => (
              <Rect
                key={`v-${index}`}
                x={candle.x}
                y={layout.volumeBottom - candle.volumeH}
                width={candle.candleW}
                height={candle.volumeH}
                fill={candle.isBull ? colors.positive : colors.danger}
                opacity={0.48}
              />
            ))}
          </G>
        ) : null}

        {visualType === 'line' ? (
          <Path d={layout.linePath} stroke={colors.accent} strokeWidth={2} fill="none" />
        ) : (
          layout.candles.map((candle, index) => {
            const color = candle.isBull ? colors.positive : colors.danger;
            if (visualType === 'bars') {
              return (
                <G key={`c-${index}`}>
                  <Line x1={candle.wickX} x2={candle.wickX} y1={candle.highY} y2={candle.lowY} stroke={color} strokeWidth={1.2} />
                  <Line x1={candle.wickX - candle.candleW / 2} x2={candle.wickX} y1={candle.openY} y2={candle.openY} stroke={color} strokeWidth={1.2} />
                  <Line x1={candle.wickX} x2={candle.wickX + candle.candleW / 2} y1={candle.closeY} y2={candle.closeY} stroke={color} strokeWidth={1.2} />
                </G>
              );
            }
            return (
              <G key={`c-${index}`}>
                <Line
                  x1={candle.wickX}
                  x2={candle.wickX}
                  y1={candle.wickTop}
                  y2={candle.wickBottom}
                  stroke={color}
                  strokeWidth={1}
                />
                <Rect
                  x={candle.x}
                  y={candle.bodyTop}
                  width={candle.candleW}
                  height={candle.bodyHeight}
                  fill={visualType === 'hollow' && candle.isBull ? 'transparent' : color}
                  stroke={color}
                  strokeWidth={visualType === 'hollow' && candle.isBull ? 1.2 : 0}
                  rx={0.5}
                />
              </G>
            );
          })
        )}

        {layout.bollingerUpperPath ? (
          <G opacity={0.86}>
            <Path d={layout.bollingerUpperPath} stroke="#7DD3FC" strokeWidth={1.1} fill="none" />
            <Path d={layout.bollingerLowerPath} stroke="#7DD3FC" strokeWidth={1.1} fill="none" />
          </G>
        ) : null}
        {layout.maPath ? <Path d={layout.maPath} stroke={colors.accent} strokeWidth={1.5} fill="none" /> : null}
        {layout.rsiPath ? <Path d={layout.rsiPath} stroke="#A78BFA" strokeWidth={1.4} fill="none" opacity={0.9} /> : null}

        {layout.objectShapes.map(({ object, p1, p2 }) => {
          if (!p1) return null;
          const selected = selectedObjectId === object.id;
          const objectColor = object.kind === 'horizontal' ? '#FBBF24' : '#60A5FA';
          const common = {
            stroke: objectColor,
            strokeWidth: selected ? 1.8 : 1.25,
          };

          return (
            <G key={object.id} opacity={selected ? 1 : 0.88}>
              {object.kind === 'trend' && p2 ? (
                <>
                  <Line x1={p1.x} x2={p2.x} y1={p1.y} y2={p2.y} {...common} />
                  {selected ? (
                    <SvgText
                      x={(p1.x + p2.x) / 2}
                      y={(p1.y + p2.y) / 2 - 8}
                      fontSize={9}
                      fontFamily={fonts.mono}
                      fill={objectColor}
                      textAnchor="middle"
                    >
                      {(p2.price - p1.price).toFixed(decimals)}
                    </SvgText>
                  ) : null}
                </>
              ) : null}

              {object.kind === 'horizontal' ? (
                <>
                  <Line
                    x1={CHART_PAD_LEFT}
                    x2={layout.plotEndX}
                    y1={p1.y}
                    y2={p1.y}
                    {...common}
                    strokeDasharray="6 4"
                  />
                  <Rect x={layout.plotEndX + 4} y={p1.y - 8} width={CHART_PAD_RIGHT - 8} height={16} rx={3} fill={objectColor} />
                  <SvgText
                    x={width - 4}
                    y={p1.y + 3}
                    fontSize={9}
                    fontFamily={fonts.mono}
                    fill={colors.bg}
                    textAnchor="end"
                    fontWeight="600"
                  >
                    {p1.price.toFixed(decimals)}
                  </SvgText>
                </>
              ) : null}

              {object.kind === 'rectangle' && p2 ? (
                <Rect
                  x={Math.min(p1.x, p2.x)}
                  y={Math.min(p1.y, p2.y)}
                  width={Math.abs(p2.x - p1.x)}
                  height={Math.abs(p2.y - p1.y)}
                  fill="rgba(96,165,250,0.08)"
                  {...common}
                  strokeDasharray={selected ? undefined : '4 4'}
                />
              ) : null}

              {object.kind === 'text' ? (
                <SvgText x={p1.x} y={p1.y} fontSize={11} fontFamily={fonts.bodySemi} fill={colors.accent}>
                  {object.label}
                </SvgText>
              ) : null}

              {selected ? (
                <>
                  <Circle cx={p1.x} cy={p1.y} r={DRAWING_HANDLE_RADIUS} fill={colors.bg} stroke={objectColor} strokeWidth={1.5} />
                  {p2 ? (
                    <Circle cx={p2.x} cy={p2.y} r={DRAWING_HANDLE_RADIUS} fill={colors.bg} stroke={objectColor} strokeWidth={1.5} />
                  ) : null}
                </>
              ) : null}
            </G>
          );
        })}

        {layout.alertLines.map((alert) => (
          <G key={alert.id} opacity={0.9}>
            <Line x1={CHART_PAD_LEFT} x2={layout.plotEndX} y1={alert.y} y2={alert.y} stroke="#F59E0B" strokeWidth={1.1} strokeDasharray="4 4" />
            <SvgText x={layout.plotEndX - 4} y={alert.y - 4} fontSize={9} fontFamily={fonts.mono} fill="#F59E0B" textAnchor="end">
              {alert.direction.toUpperCase()}
            </SvgText>
          </G>
        ))}

        <Line
          x1={CHART_PAD_LEFT}
          x2={layout.plotEndX}
          y1={layout.lastY}
          y2={layout.lastY}
          stroke={colors.ink}
          strokeWidth={StyleSheet.hairlineWidth}
          strokeDasharray="3 3"
          opacity={0.5}
        />

        <Line
          x1={CHART_PAD_LEFT}
          x2={layout.plotEndX}
          y1={layout.bidY}
          y2={layout.bidY}
          stroke={colors.danger}
          strokeWidth={StyleSheet.hairlineWidth}
          strokeDasharray="2 3"
          opacity={priceSource === 'bid' ? 0.8 : 0.42}
        />
        <Line
          x1={CHART_PAD_LEFT}
          x2={layout.plotEndX}
          y1={layout.askY}
          y2={layout.askY}
          stroke={colors.positive}
          strokeWidth={StyleSheet.hairlineWidth}
          strokeDasharray="2 3"
          opacity={priceSource === 'ask' ? 0.8 : 0.42}
        />

        <Rect
          x={width - CHART_PAD_RIGHT + 2}
          y={layout.lastY - 9}
          width={CHART_PAD_RIGHT - 4}
          height={18}
          rx={3}
          fill={colors.accent}
        />
        <SvgText
          x={width - CHART_PAD_RIGHT / 2}
          y={layout.lastY + 3}
          fontSize={10}
          fontFamily={fonts.mono}
          fill={colors.bg}
          textAnchor="middle"
          fontWeight="600"
        >
          {layout.lastCandle.close.toFixed(decimals)}
        </SvgText>
      </Svg>
    </View>
  );
});
