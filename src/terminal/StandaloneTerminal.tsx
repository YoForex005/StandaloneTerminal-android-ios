import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  CandlestickChart,
  type Candle,
  type ChartIndicator,
  type ChartObject,
  type ChartPriceAlert,
  type ChartPriceSource,
  type ChartVisualType,
} from './CandlestickChart';
import { colors, fonts, radius } from './theme';
import { useFadeIn } from './useFadeIn';
import {
  generateCandles,
  positionPnl,
  roundTo,
  SYMBOL_LIST,
  SYMBOLS,
  TF_MINUTES,
  tickCandles,
  TIMEFRAMES,
  type DemoPosition,
  type MarketSymbol,
  type Timeframe,
} from './mockMarket';

type TradeNoticeSide = 'buy' | 'sell' | 'center';
type TradeNoticeState = {
  message: string;
  side: TradeNoticeSide;
};

type FeaturePanel = 'settings' | 'indicators' | 'objects' | 'alerts' | 'analytics' | 'specification' | 'more';
type FullChartPanel = 'symbols' | 'timeframes' | 'indicators' | 'settings' | 'account' | 'lots';
type ChartColorScheme = 'RTX-5' | 'Classic' | 'Emerald' | 'Mono';

const PANEL_HANDLE_HEIGHT = 104;
const PANEL_NAV_REVEAL_HEIGHT = 64;
const INITIAL_PANEL_TRAVEL = 230 + PANEL_NAV_REVEAL_HEIGHT - PANEL_HANDLE_HEIGHT;
const PANEL_SETTLE_MS = 340;
const PANEL_DRAG_START_DISTANCE = 12;
const PANEL_SETTLE_DRAG_DISTANCE = 64;
const PANEL_SETTLE_FLING_VELOCITY = 0.65;

const defaultSymbol = String(process.env.EXPO_PUBLIC_DEFAULT_SYMBOL ?? 'EURUSD').toUpperCase();
const defaultLots = Number(process.env.EXPO_PUBLIC_DEFAULT_LOTS ?? 0.5);
const MESH_VIEWBOX_W = 393;
const MESH_VIEWBOX_H = 852;

const INDICATOR_SECTIONS: Array<{ title: string; items: ChartIndicator[] }> = [
  { title: 'Trend', items: ['MA', 'Bollinger'] },
  { title: 'Oscillators', items: ['RSI'] },
];

const SCHEMES: Record<ChartColorScheme, string> = {
  'RTX-5': 'Gold accent, dark terminal',
  Classic: 'MT style with blue action focus',
  Emerald: 'Green positive emphasis',
  Mono: 'Low-color execution view',
};

const fmtPrice = (n: number, decimals: number) =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const fmtVolume = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

const fmtSpread = (symbol: MarketSymbol) => {
  const pip = symbol.decimals >= 4 ? 10000 : symbol.decimals === 3 ? 100 : 10;
  return (symbol.spread * pip).toFixed(1);
};

const fmtChartTime = (time: number) =>
  new Date(time).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const shouldStartFullChart = () =>
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('fullChart') === '1';

const getInitialFullChartPanel = (): FullChartPanel | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const panel = new URLSearchParams(window.location.search).get('panel');
  return panel === 'symbols' ||
    panel === 'timeframes' ||
    panel === 'indicators' ||
    panel === 'settings' ||
    panel === 'account' ||
    panel === 'lots'
    ? panel
    : null;
};

const splitLastDigit = (n: number, decimals: number) => {
  const fixed = fmtPrice(n, decimals);
  if (decimals <= 0) return { main: fixed, tail: '' };
  return { main: fixed.slice(0, -1), tail: fixed.slice(-1) };
};

const DarkMesh = () => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${MESH_VIEWBOX_W} ${MESH_VIEWBOX_H}`}
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient
          id="meshGold"
          cx="78.6"
          cy="68.2"
          r="420"
          fx="78.6"
          fy="68.2"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(78.6 68.2) scale(1 0.762) translate(-78.6 -68.2)"
        >
          <Stop offset="0%" stopColor="#E5C07B" stopOpacity="0.22" />
          <Stop offset="60%" stopColor="#E5C07B" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient
          id="meshBlue"
          cx="361.6"
          cy="153.4"
          r="380"
          fx="361.6"
          fy="153.4"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(361.6 153.4) scale(1 0.947) translate(-361.6 -153.4)"
        >
          <Stop offset="0%" stopColor="#4682FF" stopOpacity="0.14" />
          <Stop offset="60%" stopColor="#4682FF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient
          id="meshPurple"
          cx="275.1"
          cy="783.8"
          r="520"
          fx="275.1"
          fy="783.8"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(275.1 783.8) scale(1 0.808) translate(-275.1 -783.8)"
        >
          <Stop offset="0%" stopColor="#B45ADC" stopOpacity="0.10" />
          <Stop offset="60%" stopColor="#B45ADC" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient
          id="meshGreen"
          cx="47.2"
          cy="596.4"
          r="280"
          fx="47.2"
          fy="596.4"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(47.2 596.4) scale(1 0.857) translate(-47.2 -596.4)"
        >
          <Stop offset="0%" stopColor="#57E08A" stopOpacity="0.06" />
          <Stop offset="60%" stopColor="#57E08A" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={MESH_VIEWBOX_W} height={MESH_VIEWBOX_H} fill="url(#meshGold)" />
      <Rect width={MESH_VIEWBOX_W} height={MESH_VIEWBOX_H} fill="url(#meshBlue)" />
      <Rect width={MESH_VIEWBOX_W} height={MESH_VIEWBOX_H} fill="url(#meshPurple)" />
      <Rect width={MESH_VIEWBOX_W} height={MESH_VIEWBOX_H} fill="url(#meshGreen)" />
    </Svg>
  </View>
);

export const StandaloneTerminal = () => {
  const initialSymbol = SYMBOLS[defaultSymbol] ? defaultSymbol : 'EURUSD';
  const insets = useSafeAreaInsets();
  const [symbolKey, setSymbolKey] = useState(initialSymbol);
  const [tf, setTf] = useState<Timeframe>('M5');
  const [candles, setCandles] = useState(() => generateCandles(SYMBOLS[initialSymbol], 'M5'));
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);
  const [chartHeight, setChartHeight] = useState(0);
  const [fullChart, setFullChart] = useState(shouldStartFullChart);
  const [fullChartWidth, setFullChartWidth] = useState(0);
  const [fullChartHeight, setFullChartHeight] = useState(0);
  const [fullChartPanel, setFullChartPanel] = useState<FullChartPanel | null>(getInitialFullChartPanel);
  const [fullChartLots, setFullChartLots] = useState(Number.isFinite(defaultLots) && defaultLots >= 0.01 ? defaultLots : 0.5);
  const [featurePanel, setFeaturePanel] = useState<FeaturePanel | null>(null);
  const [chartType, setChartType] = useState<ChartVisualType>('candles');
  const [priceSource, setPriceSource] = useState<ChartPriceSource>('mid');
  const [colorScheme, setColorScheme] = useState<ChartColorScheme>('RTX-5');
  const [showVolumePane, setShowVolumePane] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<ChartIndicator[]>(['MA']);
  const [chartObjects, setChartObjects] = useState<ChartObject[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<ChartPriceAlert[]>([]);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [tradeNotice, setTradeNotice] = useState<TradeNoticeState | null>(null);
  const tradeNoticeAnim = useRef(new Animated.Value(0)).current;
  const tradeNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const symbol = SYMBOLS[symbolKey] ?? SYMBOLS.EURUSD;
  const a1 = useFadeIn(0);
  const a2 = useFadeIn(80);
  const livePulse = useRef(new Animated.Value(0)).current;

  const openFullChart = useCallback(() => setFullChart(true), []);
  const closeFullChart = useCallback(() => {
    setFullChart(false);
    setFullChartPanel(null);
  }, []);
  const toggleIndicator = useCallback((indicator: ChartIndicator) => {
    setActiveIndicators((current) =>
      current.includes(indicator)
        ? current.filter((item) => item !== indicator)
        : [...current, indicator],
    );
  }, []);
  const addChartObject = useCallback((kind: ChartObject['kind']) => {
    const recent = candles.slice(-Math.min(52, candles.length));
    const fallback = candles[candles.length - 1] ?? {
      time: Date.now(),
      open: symbol.basePrice,
      high: symbol.basePrice,
      low: symbol.basePrice,
      close: symbol.basePrice,
      volume: 0,
    };
    const left = recent[Math.max(0, Math.floor(recent.length * 0.28))] ?? fallback;
    const right = recent[Math.max(0, Math.floor(recent.length * 0.78))] ?? fallback;
    const low = recent.length ? Math.min(...recent.map((candle) => candle.low)) : fallback.low;
    const high = recent.length ? Math.max(...recent.map((candle) => candle.high)) : fallback.high;
    const range = Math.max(high - low, Math.pow(10, -symbol.decimals));
    const labelByKind: Record<ChartObject['kind'], string> = {
      trend: 'Trend line',
      horizontal: 'Horizontal line',
      rectangle: 'Highlight box',
      text: 'Text note',
    };

    setChartObjects((current) => {
      const index = current.length + 1;
      const base = {
        id: `obj-${Date.now()}-${current.length}`,
        kind,
        label: `${labelByKind[kind]} ${index}`,
      };

      if (kind === 'horizontal') {
        return [
          ...current,
          {
            ...base,
            p1: { time: fallback.time, price: roundTo(fallback.close, symbol.decimals) },
          },
        ];
      }

      if (kind === 'rectangle') {
        return [
          ...current,
          {
            ...base,
            p1: { time: left.time, price: roundTo(high - range * 0.16, symbol.decimals) },
            p2: { time: right.time, price: roundTo(low + range * 0.24, symbol.decimals) },
          },
        ];
      }

      if (kind === 'text') {
        return [
          ...current,
          {
            ...base,
            p1: { time: right.time, price: roundTo(high - range * 0.2, symbol.decimals) },
          },
        ];
      }

      return [
        ...current,
        {
          ...base,
          p1: { time: left.time, price: roundTo(low + range * 0.3, symbol.decimals) },
          p2: { time: right.time, price: roundTo(high - range * 0.2, symbol.decimals) },
        },
      ];
    });
  }, [candles, symbol.basePrice, symbol.decimals]);
  const toggleChartObjectHidden = useCallback((id: string) => {
    setChartObjects((current) =>
      current.map((object) => (object.id === id ? { ...object, hidden: !object.hidden } : object)),
    );
  }, []);
  const removeChartObject = useCallback((id: string) => {
    setChartObjects((current) => current.filter((object) => object.id !== id));
  }, []);
  const removePriceAlert = useCallback((id: string) => {
    setPriceAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  const showTradeNotice = useCallback(
    (message: string, side: TradeNoticeSide = 'center') => {
      if (tradeNoticeTimerRef.current) clearTimeout(tradeNoticeTimerRef.current);
      tradeNoticeAnim.stopAnimation();
      tradeNoticeAnim.setValue(0);
      setTradeNotice({ message, side });
      Animated.sequence([
        Animated.spring(tradeNoticeAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 120,
          friction: 10,
        }),
        Animated.delay(900),
        Animated.timing(tradeNoticeAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setTradeNotice(null);
      });
      tradeNoticeTimerRef.current = setTimeout(() => setTradeNotice(null), 1400);
    },
    [tradeNoticeAnim],
  );

  useEffect(() => {
    setCandles(generateCandles(symbol, tf));
  }, [symbol, tf]);

  useEffect(() => {
    const id = setInterval(() => {
      setCandles((current) => tickCandles(current, symbol, tf));
    }, 750);
    return () => clearInterval(id);
  }, [symbol, tf]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 920, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [livePulse]);

  useEffect(() => {
    return () => {
      if (tradeNoticeTimerRef.current) clearTimeout(tradeNoticeTimerRef.current);
      tradeNoticeAnim.stopAnimation();
    };
  }, [tradeNoticeAnim]);

  const lastCandle = candles[candles.length - 1];
  const openingPrice = candles[0]?.open ?? symbol.basePrice;
  const change = lastCandle ? lastCandle.close - openingPrice : 0;
  const changePercent = openingPrice ? (change / openingPrice) * 100 : 0;
  const positive = change >= 0;
  const priceParts = lastCandle ? splitLastDigit(lastCandle.close, symbol.decimals) : { main: '--', tail: '' };
  const addPriceAlert = useCallback(() => {
    if (!lastCandle) return;
    const offset = symbol.spread * (priceAlerts.length + 1) * 2;
    setPriceAlerts((current) => [
      ...current,
      {
        id: `alert-${Date.now()}-${current.length}`,
        price: roundTo(lastCandle.close + offset, symbol.decimals),
        direction: 'above',
      },
    ]);
  }, [lastCandle, priceAlerts.length, symbol.decimals, symbol.spread]);
  const ohlc = useMemo(() => {
    if (candles.length === 0) return { o: 0, h: 0, l: 0, vol: 0 };
    const visible = candles.slice(-Math.min(48, candles.length));
    return {
      o: visible[0].open,
      h: Math.max(...visible.map((candle) => candle.high)),
      l: Math.min(...visible.map((candle) => candle.low)),
      vol: visible.reduce((acc, candle) => acc + candle.volume, 0),
    };
  }, [candles]);
  const chartTimeLabels = useMemo(() => {
    const visible = candles.slice(-Math.min(20, candles.length));
    if (visible.length === 0) return [];
    const middle = visible[Math.floor(visible.length / 2)] ?? visible[0];
    const last = visible[visible.length - 1] ?? middle;
    return [visible[0], middle, last].map((candle) => fmtChartTime(candle.time));
  }, [candles]);

  useEffect(() => {
    if (!lastCandle) return;
    setPositions((current) =>
      current.map((position) => ({
        ...position,
        currentPrice: lastCandle.close,
        pnl: positionPnl(position, lastCandle.close),
      })),
    );
  }, [lastCandle]);

  const placeDemoTrade = useCallback(
    (side: 'buy' | 'sell', lots: number, price: number) => {
      const next: DemoPosition = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        symbol: symbol.code,
        side: side === 'buy' ? 'BUY' : 'SELL',
        lots,
        openPrice: price,
        currentPrice: price,
        pnl: 0,
        openedAt: Date.now(),
      };
      setPositions((current) => [next, ...current]);
      showTradeNotice(`${next.side} trade sent`, side);
      setTimeout(() => showTradeNotice('Trade placed'), 420);
    },
    [showTradeNotice, symbol.code],
  );

  const closePosition = useCallback(
    (id: string) => {
      setPositions((current) => current.filter((position) => position.id !== id));
      showTradeNotice('Trade closed');
    },
    [showTradeNotice],
  );

  const fullChartSellPrice = lastCandle ? roundTo(lastCandle.close - symbol.spread / 2, symbol.decimals) : null;
  const fullChartBuyPrice = lastCandle ? roundTo(lastCandle.close + symbol.spread / 2, symbol.decimals) : null;
  const demoEquity = 70000 + positions.reduce((sum, position) => sum + position.pnl, 0);
  const symbolPositions = positions.filter((position) => position.symbol === symbol.code);
  const symbolPnl = symbolPositions.reduce((sum, position) => sum + position.pnl, 0);
  const updateFullChartLots = useCallback((nextLots: number) => {
    setFullChartLots(roundTo(Math.max(0.01, Math.min(100, nextLots)), 2));
  }, []);
  const submitFullChartTrade = useCallback(
    (side: 'buy' | 'sell') => {
      const price = side === 'buy' ? fullChartBuyPrice : fullChartSellPrice;
      if (price == null) return;
      placeDemoTrade(side, fullChartLots, price);
    },
    [fullChartBuyPrice, fullChartLots, fullChartSellPrice, placeDemoTrade],
  );

  const tradeNoticeOverlay = tradeNotice ? (
    <View pointerEvents="none" style={s.tradeNoticeWrap}>
      <Animated.View
        style={[
          s.tradeNotice,
          {
            opacity: tradeNoticeAnim,
            transform: [
              {
                translateX: tradeNoticeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [tradeNotice.side === 'buy' ? 112 : tradeNotice.side === 'sell' ? -112 : 0, 0],
                }),
              },
              {
                translateY: tradeNoticeAnim.interpolate({ inputRange: [0, 1], outputRange: [104, 0] }),
              },
              {
                scale: tradeNoticeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
              },
            ],
          },
        ]}
      >
        <View style={s.tradeNoticeDot} />
        <Text style={s.tradeNoticeText}>{tradeNotice.message}</Text>
      </Animated.View>
    </View>
  ) : null;
  const fullChartTopOffset = Math.max(insets.top, Platform.OS === 'web' ? 18 : 10) + 10;
  const fullChartBottomOffset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8) + 10;
  const fullChartPanelPlacement =
    fullChartPanel === 'symbols' || fullChartPanel === 'account'
      ? { top: fullChartTopOffset + 44, left: 16, right: 16 }
      : { left: 16, right: 16, bottom: fullChartBottomOffset + 142 };

  if (fullChart) {
    return (
      <SafeAreaView edges={[]} style={s.root}>
        <View
          style={[
            s.fullChartSection,
            {
              top: fullChartTopOffset + 48,
              bottom: fullChartBottomOffset + 112,
            },
          ]}
        >
          <View
            style={s.fullChartOnlyWrap}
          onLayout={(event) => {
            const nextWidth = Math.floor(event.nativeEvent.layout.width);
            const nextHeight = Math.floor(event.nativeEvent.layout.height);
            if (nextWidth !== fullChartWidth) setFullChartWidth(nextWidth);
            if (nextHeight !== fullChartHeight) setFullChartHeight(nextHeight);
          }}
        >
          {fullChartWidth > 0 && fullChartHeight > 0 ? (
            <CandlestickChart
              data={candles}
              width={fullChartWidth}
              height={fullChartHeight}
              decimals={symbol.decimals}
              visualType={chartType}
              priceSource={priceSource}
              spread={symbol.spread}
              showVolume={showVolumePane}
              activeIndicators={activeIndicators}
              objects={chartObjects}
              onObjectsChange={setChartObjects}
              alerts={priceAlerts}
            />
          ) : null}
          </View>
          <View style={s.chartAxisFrame}>
            {chartTimeLabels.map((label, index) => (
              <Text
                key={`full-${label}-${index}`}
                style={[
                  s.chartAxisText,
                  index === 1 && s.chartAxisTextCenter,
                  index === 2 && s.chartAxisTextEnd,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            ))}
          </View>
        </View>
        <View style={[s.fullChartTopBar, { top: fullChartTopOffset }]}>
          <Pressable
            onPress={() => {
              setFullChartPanel((panel) => (panel === 'symbols' ? null : 'symbols'));
            }}
            style={({ pressed }) => [s.fullChartSymbolBtn, { opacity: pressed ? 0.72 : 1 }]}
          >
            <View style={s.fullChartSymbolIcon}>
              <Feather name="dollar-sign" size={12} color={colors.bg} />
            </View>
            <Feather name="chevron-down" size={14} color={colors.inkSecondary} />
          </Pressable>
          <Pressable
            onPress={() => setFullChartPanel((panel) => (panel === 'account' ? null : 'account'))}
            style={({ pressed }) => [s.fullChartAccountPill, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Text style={s.fullChartDemoBadge} numberOfLines={1}>Demo</Text>
            <Text style={s.fullChartBalanceText} numberOfLines={1}>{fmtPrice(demoEquity, 2)} USD</Text>
            <Feather name="more-vertical" size={14} color={colors.inkSecondary} />
          </Pressable>
          <Pressable onPress={closeFullChart} hitSlop={8} style={({ pressed }) => [s.fullChartExpandBtn, { opacity: pressed ? 0.72 : 1 }]}>
            <Feather name="minimize-2" size={17} color={colors.ink} />
          </Pressable>
        </View>
        <View style={[s.fullChartToolRow, { bottom: fullChartBottomOffset + 150 }]}>
          <Pressable
            onPress={() => setFullChartPanel((panel) => (panel === 'timeframes' ? null : 'timeframes'))}
            style={({ pressed }) => [s.fullChartToolBtn, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Text style={s.fullChartToolText}>{tf.toLowerCase()}</Text>
          </Pressable>
          <Pressable
            onPress={() => setFullChartPanel((panel) => (panel === 'settings' ? null : 'settings'))}
            style={({ pressed }) => [s.fullChartToolBtn, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Feather name="sliders" size={15} color={colors.ink} />
          </Pressable>
          <Pressable
            onPress={() => setFullChartPanel((panel) => (panel === 'indicators' ? null : 'indicators'))}
            style={({ pressed }) => [s.fullChartToolBtn, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Text style={s.fullChartToolText}>fx</Text>
          </Pressable>
        </View>
        {fullChartPanel ? (
          <>
            <Pressable style={s.fullChartPanelBackdrop} onPress={() => setFullChartPanel(null)} />
            <View
              style={[
                s.fullChartFloatingPanel,
                fullChartPanelPlacement,
              ]}
            >
              {fullChartPanel === 'symbols' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fullChartPanelRow}>
                  {SYMBOL_LIST.map((item) => {
                    const active = item.code === symbol.code;
                    return (
                      <Pressable
                        key={item.code}
                        onPress={() => {
                          setSymbolKey(item.code);
                          setFullChartPanel(null);
                        }}
                        style={({ pressed }) => [
                          s.fullChartPanelChip,
                          active && s.fullChartPanelChipActive,
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <Text style={[s.fullChartPanelChipText, active && s.fullChartPanelChipTextActive]}>{item.code}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              {fullChartPanel === 'account' ? (
                <View style={s.fullChartPanelColumn}>
                  <View style={s.fullChartPanelMetricRow}>
                    <Text style={s.fullChartPanelMetricLabel}>Equity</Text>
                    <Text style={s.fullChartPanelMetricValue}>{fmtPrice(demoEquity, 2)} USD</Text>
                  </View>
                  <View style={s.fullChartPanelMetricRow}>
                    <Text style={s.fullChartPanelMetricLabel}>{symbol.code} positions</Text>
                    <Text style={s.fullChartPanelMetricValue}>{symbolPositions.length}</Text>
                  </View>
                  <View style={s.fullChartPanelMetricRow}>
                    <Text style={s.fullChartPanelMetricLabel}>Floating P/L</Text>
                    <Text style={[s.fullChartPanelMetricValue, { color: symbolPnl >= 0 ? colors.positive : colors.danger }]}>
                      {symbolPnl >= 0 ? '+' : ''}${symbolPnl.toFixed(2)}
                    </Text>
                  </View>
                  <View style={s.fullChartPanelRow}>
                    <Pressable
                      onPress={() => {
                        addPriceAlert();
                        setFullChartPanel(null);
                      }}
                      style={({ pressed }) => [s.fullChartPanelActionBtn, { opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Feather name="bell" size={14} color={colors.accent} />
                      <Text style={s.fullChartPanelActionText}>Alert</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setFullChartPanel('lots')}
                      style={({ pressed }) => [s.fullChartPanelActionBtn, { opacity: pressed ? 0.75 : 1 }]}
                    >
                      <Feather name="edit-3" size={14} color={colors.accent} />
                      <Text style={s.fullChartPanelActionText}>Lots</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {fullChartPanel === 'timeframes' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fullChartPanelRow}>
                  {TIMEFRAMES.map((option) => {
                    const active = option === tf;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setTf(option);
                          setFullChartPanel(null);
                        }}
                        style={({ pressed }) => [
                          s.fullChartPanelChip,
                          active && s.fullChartPanelChipActive,
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <Text style={[s.fullChartPanelChipText, active && s.fullChartPanelChipTextActive]}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              {fullChartPanel === 'lots' ? (
                <View style={s.fullChartPanelColumn}>
                  <View style={s.fullChartLotsEditor}>
                    <Pressable onPress={() => updateFullChartLots(fullChartLots - 0.01)} style={s.fullChartLotsStep}>
                      <Text style={s.fullChartLotsStepText}>-</Text>
                    </Pressable>
                    <View style={s.fullChartLotsReadout}>
                      <Text style={s.fullChartLotsReadoutValue}>{fullChartLots.toFixed(2)}</Text>
                      <Text style={s.fullChartLotsReadoutLabel}>LOTS</Text>
                    </View>
                    <Pressable onPress={() => updateFullChartLots(fullChartLots + 0.01)} style={s.fullChartLotsStep}>
                      <Text style={s.fullChartLotsStepText}>+</Text>
                    </Pressable>
                  </View>
                  <View style={s.fullChartPanelRow}>
                    {[0.01, 0.1, 0.5, 1].map((value) => (
                      <Pressable
                        key={value}
                        onPress={() => updateFullChartLots(value)}
                        style={({ pressed }) => [
                          s.fullChartPanelChip,
                          fullChartLots === value && s.fullChartPanelChipActive,
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <Text style={[s.fullChartPanelChipText, fullChartLots === value && s.fullChartPanelChipTextActive]}>
                          {value.toFixed(2)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {fullChartPanel === 'indicators' ? (
                <View style={s.fullChartPanelColumn}>
                  {INDICATOR_SECTIONS.flatMap((section) => section.items).map((indicator) => {
                    const active = activeIndicators.includes(indicator);
                    return (
                      <Pressable
                        key={indicator}
                        onPress={() => toggleIndicator(indicator)}
                        style={({ pressed }) => [
                          s.fullChartPanelOption,
                          active && s.fullChartPanelOptionActive,
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                      >
                        <Text style={s.fullChartPanelOptionText}>{indicator === 'MA' ? 'Moving Average' : indicator}</Text>
                        {active ? <Feather name="check" size={14} color={colors.positive} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {fullChartPanel === 'settings' ? (
                <View style={s.fullChartPanelColumn}>
                  <Text style={s.fullChartPanelSectionLabel}>CHART TYPE</Text>
                  <View style={s.fullChartPanelWrapRow}>
                    {(['candles', 'bars', 'line', 'hollow'] as ChartVisualType[]).map((type) => {
                      const active = type === chartType;
                      return (
                        <Pressable
                          key={type}
                          onPress={() => setChartType(type)}
                          style={({ pressed }) => [
                            s.fullChartPanelChip,
                            active && s.fullChartPanelChipActive,
                            { opacity: pressed ? 0.75 : 1 },
                          ]}
                        >
                          <Text style={[s.fullChartPanelChipText, active && s.fullChartPanelChipTextActive]}>{type.toUpperCase()}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={s.fullChartPanelSectionLabel}>PRICE SOURCE</Text>
                  <View style={s.fullChartPanelWrapRow}>
                    {(['mid', 'bid', 'ask'] as ChartPriceSource[]).map((source) => {
                      const active = source === priceSource;
                      return (
                        <Pressable
                          key={source}
                          onPress={() => setPriceSource(source)}
                          style={({ pressed }) => [
                            s.fullChartPanelChip,
                            active && s.fullChartPanelChipActive,
                            { opacity: pressed ? 0.75 : 1 },
                          ]}
                        >
                          <Text style={[s.fullChartPanelChipText, active && s.fullChartPanelChipTextActive]}>{source.toUpperCase()}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    onPress={() => setShowVolumePane(!showVolumePane)}
                    style={({ pressed }) => [s.fullChartPanelOption, showVolumePane && s.fullChartPanelOptionActive, { opacity: pressed ? 0.75 : 1 }]}
                  >
                    <Text style={s.fullChartPanelOptionText}>VOLUME</Text>
                    {showVolumePane ? <Feather name="check" size={14} color={colors.positive} /> : null}
                  </Pressable>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
        <View style={[s.fullChartTradeDock, { bottom: fullChartBottomOffset }]}>
          <View style={s.fullChartTradeRow}>
            <Pressable
              onPress={() => submitFullChartTrade('sell')}
              disabled={fullChartSellPrice == null}
              style={({ pressed }) => [
                s.fullChartSideBtn,
                s.fullChartSellBtn,
                { opacity: fullChartSellPrice == null ? 0.45 : pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={s.fullChartSideLabel}>Sell</Text>
              <Text style={s.fullChartSidePrice} numberOfLines={1}>{fullChartSellPrice == null ? '--' : fmtPrice(fullChartSellPrice, symbol.decimals)}</Text>
            </Pressable>
            <Pressable
              onPress={() => setFullChartPanel((panel) => (panel === 'lots' ? null : 'lots'))}
              style={({ pressed }) => [s.fullChartLotsPill, { opacity: pressed ? 0.72 : 1 }]}
            >
              <Text style={s.fullChartLotsValue}>{fullChartLots.toFixed(2)}</Text>
            </Pressable>
            <Pressable
              onPress={() => submitFullChartTrade('buy')}
              disabled={fullChartBuyPrice == null}
              style={({ pressed }) => [
                s.fullChartSideBtn,
                s.fullChartBuyBtn,
                { opacity: fullChartBuyPrice == null ? 0.45 : pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={s.fullChartBuyLabel}>Buy</Text>
              <Text style={s.fullChartBuyPrice} numberOfLines={1}>{fullChartBuyPrice == null ? '--' : fmtPrice(fullChartBuyPrice, symbol.decimals)}</Text>
            </Pressable>
          </View>
          <View style={s.fullChartSentimentRow}>
            <Pressable
              onPress={() => setFullChartPanel((panel) => (panel === 'account' ? null : 'account'))}
              style={({ pressed }) => [s.fullChartSentimentBlock, { opacity: pressed ? 0.72 : 1 }]}
            >
              <View style={s.fullChartSentimentTrack}>
                <View style={[s.fullChartSentimentFill, s.fullChartSellFill, { width: '60%' }]} />
              </View>
              <Text style={[s.fullChartSentimentText, { color: colors.danger }]}>60%</Text>
            </Pressable>
            <Pressable
              onPress={() => setFullChartPanel((panel) => (panel === 'account' ? null : 'account'))}
              style={({ pressed }) => [s.fullChartSentimentBlock, { opacity: pressed ? 0.72 : 1 }]}
            >
              <View style={s.fullChartSentimentTrack}>
                <View style={[s.fullChartSentimentFill, s.fullChartBuyFill, { width: '40%' }]} />
              </View>
              <Text style={[s.fullChartSentimentText, { color: colors.accent }]}>40%</Text>
            </Pressable>
          </View>
        </View>
        {tradeNoticeOverlay}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.root}>
      <DarkMesh />
      <View style={s.headerRow}>
        <Pressable style={s.iconBtn} hitSlop={8}>
          <Feather name="chevron-left" size={22} color={colors.ink} />
        </Pressable>
        <View style={s.headerActions}>
          <Pressable style={s.circleBtn}>
            <Feather name="bell" size={15} color={colors.accent} />
          </Pressable>
          <Pressable style={s.circleBtn}>
            <Text style={s.avatarText}>A</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.body}>
        <Animated.View style={[a1, s.symStrip]}>
          <Pressable
            onPress={() => setShowSymbolPicker((visible) => !visible)}
            hitSlop={6}
            style={({ pressed }) => [s.symBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={s.symCode}>{symbol.code}</Text>
            <Feather name="chevron-down" size={14} color={colors.inkSecondary} />
          </Pressable>
          <View style={s.liveBadge}>
            <Animated.View
              style={[
                s.liveDotHalo,
                {
                  opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0] }),
                  transform: [{ scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
                },
              ]}
            />
            <Animated.View style={[s.liveDot, { opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) }]} />
            <Text style={s.liveLabel}>LIVE</Text>
          </View>
        </Animated.View>

        <Animated.View style={[a1, s.priceBlock]}>
          <View style={s.priceRow}>
            <Text style={s.priceMain}>{priceParts.main}</Text>
            {priceParts.tail ? <Text style={s.priceTail}>{priceParts.tail}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.changeText, { color: positive ? colors.positive : colors.danger }]}>
              {positive ? '+' : ''}{change.toFixed(symbol.decimals)}
            </Text>
            <Text style={[s.changePct, { color: positive ? colors.positive : colors.danger }]}>
              {positive ? '+' : ''}{changePercent.toFixed(2)}%
            </Text>
          </View>
        </Animated.View>

        <Animated.View style={[a2, s.ohlc]}>
          <OhlcCell label="O" value={fmtPrice(ohlc.o, symbol.decimals)} />
          <OhlcCell label="H" value={fmtPrice(ohlc.h, symbol.decimals)} />
          <OhlcCell label="L" value={fmtPrice(ohlc.l, symbol.decimals)} />
          <OhlcCell label="C" value={lastCandle ? fmtPrice(lastCandle.close, symbol.decimals) : '--'} />
          <OhlcCell label="VOL" value={fmtVolume(ohlc.vol)} />
          <OhlcCell label="SPR" value={fmtSpread(symbol)} />
        </Animated.View>

        <Animated.View style={[a2, s.chartSection]}>
          <View style={s.tfRow}>
            <ScrollView
              horizontal
              bounces={false}
              showsHorizontalScrollIndicator={false}
              style={s.tfScroll}
              contentContainerStyle={s.tfScrollContent}
            >
              {TIMEFRAMES.map((option) => {
                const active = option === tf;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setTf(option)}
                    style={({ pressed }) => [
                      s.tfBtn,
                      { backgroundColor: active ? colors.ink : 'transparent', opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[s.tfText, { color: active ? colors.bg : colors.inkSecondary }]}>{option}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={s.chartToolCluster}>
              <Pressable onPress={() => setFeaturePanel('indicators')} hitSlop={6} style={({ pressed }) => [s.tfTool, { opacity: pressed ? 0.6 : 1 }]}>
                <Text style={s.tfToolText}>fx</Text>
              </Pressable>
              <Pressable onPress={() => setFeaturePanel('objects')} hitSlop={6} style={({ pressed }) => [s.tfTool, { opacity: pressed ? 0.6 : 1 }]}>
                <Feather name="layers" size={14} color={colors.inkSecondary} />
              </Pressable>
              <Pressable onPress={() => setFeaturePanel('alerts')} hitSlop={6} style={({ pressed }) => [s.tfTool, { opacity: pressed ? 0.6 : 1 }]}>
                <Feather name="bell" size={14} color={colors.inkSecondary} />
              </Pressable>
              <Pressable onPress={() => setFeaturePanel('settings')} hitSlop={6} style={({ pressed }) => [s.tfTool, { opacity: pressed ? 0.6 : 1 }]}>
                <Feather name="sliders" size={14} color={colors.inkSecondary} />
              </Pressable>
              <Pressable onPress={() => setFeaturePanel('more')} hitSlop={6} style={({ pressed }) => [s.tfTool, { opacity: pressed ? 0.6 : 1 }]}>
                <Feather name="more-vertical" size={14} color={colors.inkSecondary} />
              </Pressable>
              <Pressable onPress={openFullChart} hitSlop={6} style={({ pressed }) => [s.tfTool, { opacity: pressed ? 0.6 : 1 }]}>
                <Feather name="maximize" size={14} color={colors.inkSecondary} />
              </Pressable>
            </View>
          </View>

          <View
            style={s.chartWrap}
            onLayout={(event) => {
              const nextWidth = Math.floor(event.nativeEvent.layout.width);
              const nextHeight = Math.floor(event.nativeEvent.layout.height);
              if (nextWidth !== chartWidth) setChartWidth(nextWidth);
              if (nextHeight !== chartHeight) setChartHeight(nextHeight);
            }}
          >
            {chartWidth > 0 && chartHeight > 0 ? (
              <CandlestickChart
                data={candles}
                width={chartWidth}
                height={chartHeight}
                decimals={symbol.decimals}
                visualType={chartType}
                priceSource={priceSource}
                spread={symbol.spread}
                showVolume={showVolumePane}
                activeIndicators={activeIndicators}
                objects={chartObjects}
                onObjectsChange={setChartObjects}
                alerts={priceAlerts}
              />
            ) : null}
          </View>
          <View style={s.chartAxisFrame}>
            {chartTimeLabels.map((label, index) => (
              <Text
                key={`${label}-${index}`}
                style={[
                  s.chartAxisText,
                  index === 1 && s.chartAxisTextCenter,
                  index === 2 && s.chartAxisTextEnd,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            ))}
          </View>
        </Animated.View>
      </View>

      {showSymbolPicker ? (
        <>
          <Pressable style={s.dropdownBackdrop} onPress={() => setShowSymbolPicker(false)} />
          <View style={s.symbolDropdown}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={s.symbolListContent}
            >
              {SYMBOL_LIST.map((item) => (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    setSymbolKey(item.code);
                    setShowSymbolPicker(false);
                  }}
                  style={({ pressed }) => [s.symbolOption, { opacity: pressed ? 0.65 : 1 }]}
                >
                  <Text style={s.symbolOptionCode}>{item.code}</Text>
                  <Text style={s.symbolOptionName}>{item.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      ) : null}

      <ChartFeaturePanel
        visible={featurePanel !== null}
        panel={featurePanel}
        symbol={symbol}
        candles={candles}
        lastPrice={lastCandle?.close ?? symbol.basePrice}
        chartType={chartType}
        priceSource={priceSource}
        colorScheme={colorScheme}
        showVolumePane={showVolumePane}
        activeIndicators={activeIndicators}
        chartObjects={chartObjects}
        priceAlerts={priceAlerts}
        onClose={() => setFeaturePanel(null)}
        onOpenPanel={setFeaturePanel}
        onSetChartType={setChartType}
        onSetPriceSource={setPriceSource}
        onSetColorScheme={setColorScheme}
        onSetShowVolumePane={setShowVolumePane}
        onToggleIndicator={toggleIndicator}
        onAddObject={addChartObject}
        onToggleObjectHidden={toggleChartObjectHidden}
        onRemoveObject={removeChartObject}
        onAddPriceAlert={addPriceAlert}
        onRemovePriceAlert={removePriceAlert}
      />

      {featurePanel ? null : (
        <TradePanel
          symbol={symbol}
          lastPrice={lastCandle?.close ?? null}
          positions={positions.filter((position) => position.symbol === symbol.code)}
          onTrade={placeDemoTrade}
          onClosePosition={closePosition}
        />
      )}

      {tradeNoticeOverlay}
    </SafeAreaView>
  );
};

const OhlcCell = ({ label, value }: { label: string; value: string }) => (
  <View style={s.ohlcCell}>
    <Text style={s.ohlcLabel}>{label}</Text>
    <Text style={s.ohlcValue}>{value}</Text>
  </View>
);

const ChartFeaturePanel = ({
  visible,
  panel,
  symbol,
  candles,
  lastPrice,
  chartType,
  priceSource,
  colorScheme,
  showVolumePane,
  activeIndicators,
  chartObjects,
  priceAlerts,
  onClose,
  onOpenPanel,
  onSetChartType,
  onSetPriceSource,
  onSetColorScheme,
  onSetShowVolumePane,
  onToggleIndicator,
  onAddObject,
  onToggleObjectHidden,
  onRemoveObject,
  onAddPriceAlert,
  onRemovePriceAlert,
}: {
  visible: boolean;
  panel: FeaturePanel | null;
  symbol: MarketSymbol;
  candles: Candle[];
  lastPrice: number;
  chartType: ChartVisualType;
  priceSource: ChartPriceSource;
  colorScheme: ChartColorScheme;
  showVolumePane: boolean;
  activeIndicators: ChartIndicator[];
  chartObjects: ChartObject[];
  priceAlerts: ChartPriceAlert[];
  onClose: () => void;
  onOpenPanel: (panel: FeaturePanel) => void;
  onSetChartType: (value: ChartVisualType) => void;
  onSetPriceSource: (value: ChartPriceSource) => void;
  onSetColorScheme: (value: ChartColorScheme) => void;
  onSetShowVolumePane: (value: boolean) => void;
  onToggleIndicator: (indicator: ChartIndicator) => void;
  onAddObject: (kind: ChartObject['kind']) => void;
  onToggleObjectHidden: (id: string) => void;
  onRemoveObject: (id: string) => void;
  onAddPriceAlert: () => void;
  onRemovePriceAlert: (id: string) => void;
}) => {
  if (!visible || !panel) return null;

  const titleByPanel: Record<FeaturePanel, string> = {
    settings: 'Chart Preferences',
    indicators: 'Indicators',
    objects: 'Objects',
    alerts: 'Price Alerts',
    analytics: `Analytics - ${symbol.code}`,
    specification: `Specification - ${symbol.code}`,
    more: 'Options',
  };

  const low = candles.length ? Math.min(...candles.map((candle) => candle.low)) : lastPrice;
  const high = candles.length ? Math.max(...candles.map((candle) => candle.high)) : lastPrice;
  const open = candles[0]?.open ?? lastPrice;
  const range = Math.max(high - low, Math.pow(10, -symbol.decimals));
  const changePct = open ? ((lastPrice - open) / open) * 100 : 0;
  const positionPct = Math.max(0, Math.min(100, ((lastPrice - low) / range) * 100));
  const contractSize = symbol.code.includes('XAU') ? 100 : symbol.code.includes('BTC') ? 1 : 100000;
  const pointValue = Math.pow(10, -symbol.decimals);

  return (
    <>
      <Pressable style={s.sheetBackdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle} numberOfLines={1}>{titleByPanel[panel]}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={s.sheetClose}>
            <Feather name="x" size={16} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetContent}>
          {panel === 'more' ? (
            <>
              <FeatureAction icon="bar-chart-2" label="Trading calculator" value="Margin, pip value" onPress={() => onOpenPanel('specification')} />
              <FeatureAction icon="activity" label="Analytics" value="Range, events, signals" onPress={() => onOpenPanel('analytics')} />
              <FeatureAction icon="clipboard" label="Specification" value="Symbol details" onPress={() => onOpenPanel('specification')} />
              <FeatureAction icon="settings" label="Chart configuration" value={colorScheme} onPress={() => onOpenPanel('settings')} />
            </>
          ) : null}

          {panel === 'settings' ? (
            <>
              <Text style={s.sheetSection}>CHART CONFIGURATION</Text>
              <OptionGroup
                label="Chart type"
                options={['candles', 'bars', 'line', 'hollow'] as ChartVisualType[]}
                value={chartType}
                onChange={onSetChartType}
              />
              <OptionGroup
                label="Price source"
                options={['mid', 'bid', 'ask'] as ChartPriceSource[]}
                value={priceSource}
                onChange={onSetPriceSource}
              />
              <Text style={s.sheetSection}>SCHEMA & COLORS</Text>
              {Object.entries(SCHEMES).map(([scheme, description]) => (
                <SelectRow
                  key={scheme}
                  label={scheme}
                  value={description}
                  active={scheme === colorScheme}
                  onPress={() => onSetColorScheme(scheme as ChartColorScheme)}
                />
              ))}
              <ToggleFeatureRow
                label="Volume pane"
                description="Render volume bars below the main chart"
                value={showVolumePane}
                onPress={() => onSetShowVolumePane(!showVolumePane)}
              />
            </>
          ) : null}

          {panel === 'indicators' ? (
            <>
              {INDICATOR_SECTIONS.map((section) => (
                <View key={section.title}>
                  <Text style={s.sheetSection}>{section.title.toUpperCase()}</Text>
                  {section.items.map((indicator) => (
                    <ToggleFeatureRow
                      key={indicator}
                      label={indicator === 'MA' ? 'Moving Average' : indicator}
                      description={indicator === 'RSI' ? 'Momentum oscillator overlay' : 'Draw on the active chart'}
                      value={activeIndicators.includes(indicator)}
                      onPress={() => onToggleIndicator(indicator)}
                    />
                  ))}
                </View>
              ))}
            </>
          ) : null}

          {panel === 'objects' ? (
            <>
              <Text style={s.sheetSection}>ADD OBJECT</Text>
              <View style={s.objectToolGrid}>
                <MiniTool label="Trend" icon="trending-up" onPress={() => onAddObject('trend')} />
                <MiniTool label="Line" icon="minus" onPress={() => onAddObject('horizontal')} />
                <MiniTool label="Box" icon="square" onPress={() => onAddObject('rectangle')} />
                <MiniTool label="Text" icon="type" onPress={() => onAddObject('text')} />
              </View>
              <Text style={s.sheetSection}>MAIN CHART ({chartObjects.length})</Text>
              {chartObjects.length === 0 ? (
                <Text style={s.emptyFeatureText}>No objects on this chart.</Text>
              ) : (
                chartObjects.map((object) => (
                  <ObjectRow
                    key={object.id}
                    object={object}
                    onToggle={() => onToggleObjectHidden(object.id)}
                    onRemove={() => onRemoveObject(object.id)}
                  />
                ))
              )}
            </>
          ) : null}

          {panel === 'alerts' ? (
            <>
              <FeatureAction icon="plus" label="Create price alert" value={fmtPrice(lastPrice, symbol.decimals)} onPress={onAddPriceAlert} />
              <Text style={s.sheetSection}>ACTIVE ALERTS ({priceAlerts.length})</Text>
              {priceAlerts.length === 0 ? (
                <Text style={s.emptyFeatureText}>No price alerts. Add one to draw an alert line on the chart.</Text>
              ) : (
                priceAlerts.map((alert) => (
                  <FeatureAction
                    key={alert.id}
                    icon="bell"
                    label={`${alert.direction.toUpperCase()} ${fmtPrice(alert.price, symbol.decimals)}`}
                    value="Remove"
                    onPress={() => onRemovePriceAlert(alert.id)}
                  />
                ))
              )}
            </>
          ) : null}

          {panel === 'analytics' ? (
            <>
              <MetricPanel
                title="Performance Snapshot"
                rows={[
                  ['Change', `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`],
                  ['Daily range', `${fmtPrice(low, symbol.decimals)} - ${fmtPrice(high, symbol.decimals)}`],
                  ['Position', `${positionPct.toFixed(0)}% in range`],
                ]}
              />
              <MetricPanel
                title="Trading Signals"
                rows={[
                  ['Bias', changePct >= 0 ? 'BUY opportunity' : 'SELL pressure'],
                  ['Entry zone', `${fmtPrice(lastPrice - range * 0.08, symbol.decimals)} - ${fmtPrice(lastPrice + range * 0.08, symbol.decimals)}`],
                  ['Risk/Reward', '1 : 2.4'],
                ]}
              />
              <MetricPanel
                title="Upcoming Events"
                rows={[
                  ['High impact', 'US durable goods orders'],
                  ['Medium impact', 'Retail sales MoM'],
                  ['News', `${symbol.name} intraday update`],
                ]}
              />
            </>
          ) : null}

          {panel === 'specification' ? (
            <>
              <MetricPanel
                title="Trading Hours"
                rows={[
                  ['Status', 'Market is open'],
                  ['Closes in', '05:42:18'],
                  ['Session', 'Mon-Fri 00:00-22:59 GMT'],
                ]}
              />
              <MetricPanel
                title="Info"
                rows={[
                  ['Minimum volume, lots', '0.01'],
                  ['Maximum volume, lots', symbol.code === 'BTCUSD' ? '5.00' : '100.00'],
                  ['Step', '0.01'],
                  ['Contract size', contractSize.toLocaleString('en-US')],
                  ['Point size', pointValue.toFixed(symbol.decimals)],
                  ['Spread', fmtSpread(symbol)],
                ]}
              />
            </>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
};

const FeatureAction = ({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={({ pressed }) => [s.featureAction, pressed && s.featurePressed]}>
    <View style={s.featureIcon}>
      <Feather name={icon} size={15} color={colors.accent} />
    </View>
    <Text style={s.featureLabel} numberOfLines={1}>{label}</Text>
    <Text style={s.featureValue} numberOfLines={1}>{value}</Text>
    <Feather name="chevron-right" size={14} color={colors.inkMuted} />
  </Pressable>
);

const OptionGroup = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <View style={s.optionGroup}>
    <Text style={s.optionLabel}>{label}</Text>
    <View style={s.optionRow}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable key={option} onPress={() => onChange(option)} style={[s.optionChip, active && s.optionChipActive]}>
            <Text style={[s.optionChipText, active && s.optionChipTextActive]}>{option.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const SelectRow = ({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={({ pressed }) => [s.selectRow, pressed && s.featurePressed]}>
    <View style={[s.selectDot, active && s.selectDotActive]} />
    <View style={s.selectCopy}>
      <Text style={s.featureLabel}>{label}</Text>
      <Text style={s.featureValue}>{value}</Text>
    </View>
    {active ? <Feather name="check" size={15} color={colors.positive} /> : null}
  </Pressable>
);

const ToggleFeatureRow = ({
  label,
  description,
  value,
  onPress,
}: {
  label: string;
  description: string;
  value: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={({ pressed }) => [s.toggleFeatureRow, pressed && s.featurePressed]}>
    <View style={s.selectCopy}>
      <Text style={s.featureLabel}>{label}</Text>
      <Text style={s.featureValue}>{description}</Text>
    </View>
    <View style={[s.switchTrack, value && s.switchTrackOn]}>
      <View style={[s.switchKnob, value && s.switchKnobOn]} />
    </View>
  </Pressable>
);

const MiniTool = ({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={({ pressed }) => [s.miniTool, pressed && s.featurePressed]}>
    <Feather name={icon} size={16} color={colors.accent} />
    <Text style={s.miniToolText}>{label}</Text>
  </Pressable>
);

const ObjectRow = ({
  object,
  onToggle,
  onRemove,
}: {
  object: ChartObject;
  onToggle: () => void;
  onRemove: () => void;
}) => (
  <View style={s.objectRow}>
    <Pressable onPress={onToggle} style={s.objectMain}>
      <Text style={s.featureLabel}>{object.label}</Text>
      <Text style={s.featureValue}>{object.hidden ? 'Hidden on chart' : `${object.kind} object`}</Text>
    </Pressable>
    <Pressable onPress={onToggle} hitSlop={8} style={s.objectIconBtn}>
      <Feather name={object.hidden ? 'eye-off' : 'eye'} size={15} color={colors.inkSecondary} />
    </Pressable>
    <Pressable onPress={onRemove} hitSlop={8} style={s.objectIconBtn}>
      <Feather name="trash-2" size={15} color={colors.danger} />
    </Pressable>
  </View>
);

const MetricPanel = ({ title, rows }: { title: string; rows: Array<[string, string]> }) => (
  <View style={s.metricPanel}>
    <Text style={s.metricTitle}>{title}</Text>
    {rows.map(([label, value]) => (
      <View key={label} style={s.metricRow}>
        <Text style={s.metricLabel}>{label}</Text>
        <Text style={s.metricValue} numberOfLines={1}>{value}</Text>
      </View>
    ))}
  </View>
);

const TradePanel = ({
  symbol,
  lastPrice,
  positions,
  onTrade,
  onClosePosition,
}: {
  symbol: MarketSymbol;
  lastPrice: number | null;
  positions: DemoPosition[];
  onTrade: (side: 'buy' | 'sell', lots: number, price: number) => void;
  onClosePosition: (id: string) => void;
}) => {
  const [lots, setLots] = useState(Number.isFinite(defaultLots) && defaultLots >= 0.01 ? defaultLots : 0.5);
  const [lotsInput, setLotsInput] = useState(lots.toFixed(2));
  const [open, setOpen] = useState(false);
  const openHeight = positions.length > 0 ? 380 : 230;
  const travel = openHeight + PANEL_NAV_REVEAL_HEIGHT - PANEL_HANDLE_HEIGHT;
  const translate = useRef(new Animated.Value(INITIAL_PANEL_TRAVEL)).current;
  const openRef = useRef(open);
  openRef.current = open;

  const setOpenAnimated = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      Animated.timing(translate, {
        toValue: nextOpen ? 0 : travel,
        duration: PANEL_SETTLE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [translate, travel],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const verticalMove = Math.abs(gesture.dy);
          return verticalMove > PANEL_DRAG_START_DISTANCE && verticalMove > Math.abs(gesture.dx) * 1.2;
        },
        onPanResponderMove: (_, gesture) => {
          const base = openRef.current ? 0 : travel;
          translate.setValue(Math.max(0, Math.min(travel, base + gesture.dy)));
        },
        onPanResponderRelease: (_, gesture) => {
          if (openRef.current) {
            setOpenAnimated(!(gesture.dy > PANEL_SETTLE_DRAG_DISTANCE || gesture.vy > PANEL_SETTLE_FLING_VELOCITY));
          } else {
            setOpenAnimated(gesture.dy < -PANEL_SETTLE_DRAG_DISTANCE || gesture.vy < -PANEL_SETTLE_FLING_VELOCITY);
          }
        },
      }),
    [setOpenAnimated, translate, travel],
  );

  const updateLots = useCallback((val: number) => {
    const rounded = roundTo(val, 2);
    setLots(rounded);
    setLotsInput(rounded.toFixed(2));
  }, []);

  const sellPrice = lastPrice == null ? null : roundTo(lastPrice - symbol.spread / 2, symbol.decimals);
  const buyPrice = lastPrice == null ? null : roundTo(lastPrice + symbol.spread / 2, symbol.decimals);

  const submit = (side: 'buy' | 'sell') => {
    const price = side === 'buy' ? buyPrice : sellPrice;
    if (price == null) return;
    onTrade(side, lots, price);
  };

  return (
    <Animated.View
      style={[
        s.panel,
        {
          height: openHeight,
          transform: [{ translateY: translate }],
        },
      ]}
    >
      <Pressable
        onPress={() => setOpenAnimated(!openRef.current)}
        style={s.panelHandle}
        accessibilityRole="button"
        {...panResponder.panHandlers}
      >
        <View style={s.handleBar} />
        <Text style={s.handleHint}>{open ? 'SWIPE DOWN TO DISMISS' : 'SWIPE UP TO TRADE'}</Text>
        <View style={s.quoteRow}>
          <QuoteCell label="QUOTE" value={symbol.code} />
          <QuoteCell label="MID" value={lastPrice == null ? '--' : fmtPrice(lastPrice, symbol.decimals)} />
          <QuoteCell label="SPREAD" value={fmtSpread(symbol)} />
        </View>
      </Pressable>

      <View style={s.panelContent}>
        <View style={s.panelGrid}>
          <Pressable
            onPress={() => submit('sell')}
            disabled={sellPrice == null}
            style={({ pressed }) => [s.sideBtn, s.sellBtn, { opacity: sellPrice == null ? 0.45 : pressed ? 0.85 : 1 }]}
          >
            <Text style={s.sideLabel}>SELL</Text>
            <Text style={s.sidePrice}>{sellPrice == null ? '--' : fmtPrice(sellPrice, symbol.decimals)}</Text>
          </Pressable>

          <View style={s.lotsBox}>
            <View style={s.lotsControlRow}>
              <Pressable onPress={() => updateLots(Math.max(0.01, lots - 0.01))} style={s.lotStep}>
                <Text style={s.lotStepText}>-</Text>
              </Pressable>
              <TextInput
                value={lotsInput}
                onChangeText={(text) => {
                  setLotsInput(text);
                  const parsed = parseFloat(text);
                  if (!Number.isNaN(parsed) && parsed >= 0.01) setLots(roundTo(parsed, 2));
                }}
                onBlur={() => updateLots(Math.max(0.01, parseFloat(lotsInput) || 0.01))}
                keyboardType="decimal-pad"
                selectTextOnFocus
                style={s.lotsInput}
              />
              <Pressable onPress={() => updateLots(lots + 0.01)} style={s.lotStep}>
                <Text style={s.lotStepText}>+</Text>
              </Pressable>
            </View>
            <Text style={s.lotsLabel}>LOTS</Text>
          </View>

          <Pressable
            onPress={() => submit('buy')}
            disabled={buyPrice == null}
            style={({ pressed }) => [s.sideBtn, s.buyBtn, { opacity: buyPrice == null ? 0.45 : pressed ? 0.85 : 1 }]}
          >
            <Text style={s.buySideLabel}>BUY</Text>
            <Text style={s.buySidePrice}>{buyPrice == null ? '--' : fmtPrice(buyPrice, symbol.decimals)}</Text>
          </Pressable>
        </View>

        <View style={s.orderMeta}>
          <Text style={s.orderMetaText}>Margin</Text>
          <Text style={s.orderMetaStrong}>--</Text>
          <Text style={s.orderMetaText}>- Pip value</Text>
          <Text style={s.orderMetaStrong}>--</Text>
          <Text style={s.orderMetaText}>- Demo mode</Text>
        </View>

        {open ? (
          <View style={s.positionsWrap}>
            <Text style={s.positionsTitle}>OPEN POSITIONS ({positions.length})</Text>
            <ScrollView style={s.positionsList} showsVerticalScrollIndicator={false}>
              {positions.length === 0 ? (
                <View style={s.emptyPositions}>
                  <ActivityIndicator color={colors.inkMuted} size="small" />
                  <Text style={s.emptyText}>No demo positions</Text>
                </View>
              ) : (
                positions.map((position) => (
                  <View key={position.id} style={s.positionRow}>
                    <View style={s.positionLeft}>
                      <Text style={[s.positionSide, position.side === 'BUY' ? s.buyTag : s.sellTag]}>{position.side}</Text>
                      <Text style={s.positionText}>{position.lots.toFixed(2)} lots @ {fmtPrice(position.openPrice, symbol.decimals)}</Text>
                    </View>
                    <Text style={[s.positionPnl, { color: position.pnl >= 0 ? colors.positive : colors.danger }]}>
                      {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                    </Text>
                    <Pressable onPress={() => onClosePosition(position.id)} hitSlop={8}>
                      <Text style={s.closeText}>CLOSE</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
};

const QuoteCell = ({ label, value }: { label: string; value: string }) => (
  <View style={s.quoteCell}>
    <Text style={s.quoteLabel}>{label}</Text>
    <Text style={s.quoteValue}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 16,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  avatarText: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: PANEL_HANDLE_HEIGHT + 12,
  },
  symStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  symBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  symCode: {
    fontSize: 18,
    fontFamily: fonts.bodySemi,
    color: colors.ink,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.positive,
    backgroundColor: colors.surface,
  },
  liveDotHalo: {
    position: 'absolute',
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.positive,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.positive,
  },
  liveLabel: {
    color: colors.positive,
    fontSize: 11,
    fontFamily: fonts.bodySemi,
  },
  priceBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  priceMain: {
    fontSize: 38,
    fontFamily: fonts.bodyMedium,
    color: colors.ink,
    lineHeight: 42,
  },
  priceTail: {
    fontSize: 22,
    fontFamily: fonts.bodyMedium,
    color: colors.inkMuted,
    marginTop: 8,
    marginLeft: 1,
  },
  changeText: {
    fontSize: 13,
    fontFamily: fonts.mono,
  },
  changePct: {
    fontSize: 12,
    fontFamily: fonts.mono,
    marginTop: 2,
  },
  ohlc: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    marginTop: 6,
  },
  ohlcCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ohlcLabel: {
    fontSize: 9,
    color: colors.inkMuted,
    fontFamily: fonts.bodySemi,
  },
  ohlcValue: {
    fontSize: 10,
    color: colors.ink,
    fontFamily: fonts.mono,
    letterSpacing: -0.2,
  },
  tfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 6,
    minHeight: 44,
  },
  tfScroll: {
    flex: 1,
    minWidth: 0,
  },
  tfScrollContent: {
    alignItems: 'center',
    gap: 2,
    paddingRight: 2,
  },
  tfBtn: {
    minWidth: 28,
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tfText: {
    fontSize: 10,
    fontFamily: fonts.bodySemi,
  },
  tfTool: {
    width: 22,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tfToolText: {
    color: colors.inkSecondary,
    fontSize: 13,
    fontFamily: fonts.bodySemi,
  },
  chartSection: {
    height: 524,
    minHeight: 440,
    marginTop: 6,
    backgroundColor: 'rgba(3,5,9,0.42)',
    overflow: 'hidden',
  },
  chartWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  chartAxisFrame: {
    height: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  chartAxisText: {
    flex: 1,
    color: colors.inkMuted,
    fontSize: 9,
    fontFamily: fonts.mono,
  },
  chartAxisTextCenter: {
    textAlign: 'center',
  },
  chartAxisTextEnd: {
    textAlign: 'right',
    color: colors.inkSecondary,
    fontFamily: fonts.bodySemi,
  },
  chartToolCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 132,
    flexShrink: 0,
  },
  fullChartSection: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  fullChartOnlyWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  fullChartTopBar: {
    position: 'absolute',
    top: 12,
    left: 62,
    right: 10,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 42,
    elevation: 14,
  },
  fullChartSymbolBtn: {
    height: 36,
    width: 58,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(12, 16, 23, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  fullChartSymbolIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
  },
  fullChartAccountPill: {
    flex: 1,
    minWidth: 0,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(12, 16, 23, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  fullChartDemoBadge: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    color: colors.positive,
    fontSize: 10,
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
  },
  fullChartBalanceText: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bodySemi,
  },
  fullChartExpandBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(12, 16, 23, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullChartToolRow: {
    position: 'absolute',
    left: 16,
    bottom: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 42,
    elevation: 14,
  },
  fullChartToolBtn: {
    minWidth: 33,
    height: 32,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(18, 25, 34, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  fullChartToolText: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bodySemi,
  },
  fullChartPanelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 41,
  },
  fullChartFloatingPanel: {
    position: 'absolute',
    maxHeight: 360,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(10, 13, 19, 0.96)',
    padding: 8,
    zIndex: 44,
    elevation: 16,
  },
  fullChartPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  fullChartPanelWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
  },
  fullChartPanelColumn: {
    gap: 7,
  },
  fullChartPanelSectionLabel: {
    color: colors.inkMuted,
    fontSize: 9,
    fontFamily: fonts.bodySemi,
    marginTop: 4,
  },
  fullChartPanelChip: {
    minWidth: 54,
    minHeight: 34,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  fullChartPanelChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  fullChartPanelChipText: {
    color: colors.inkSecondary,
    fontSize: 11,
    fontFamily: fonts.bodySemi,
  },
  fullChartPanelChipTextActive: {
    color: colors.bg,
  },
  fullChartPanelOption: {
    minHeight: 38,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fullChartPanelOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  fullChartPanelOptionText: {
    color: colors.ink,
    fontSize: 12,
    fontFamily: fonts.bodySemi,
  },
  fullChartPanelMetricRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineSoft,
  },
  fullChartPanelMetricLabel: {
    color: colors.inkMuted,
    fontSize: 11,
    fontFamily: fonts.body,
  },
  fullChartPanelMetricValue: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 12,
    fontFamily: fonts.mono,
    textAlign: 'right',
  },
  fullChartPanelActionBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  fullChartPanelActionText: {
    color: colors.ink,
    fontSize: 11,
    fontFamily: fonts.bodySemi,
  },
  fullChartLotsEditor: {
    minHeight: 48,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  fullChartLotsStep: {
    width: 54,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  fullChartLotsStepText: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.bodySemi,
  },
  fullChartLotsReadout: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullChartLotsReadoutValue: {
    color: colors.ink,
    fontSize: 16,
    fontFamily: fonts.mono,
  },
  fullChartLotsReadoutLabel: {
    color: colors.inkMuted,
    fontSize: 8,
    fontFamily: fonts.bodySemi,
  },
  fullChartTradeDock: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 86,
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 0,
    zIndex: 42,
    elevation: 14,
  },
  fullChartTradeRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullChartSideBtn: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
  },
  fullChartSellBtn: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  fullChartBuyBtn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  fullChartSideLabel: {
    color: colors.bg,
    fontSize: 11,
    fontFamily: fonts.bodySemi,
  },
  fullChartBuyLabel: {
    color: colors.bg,
    fontSize: 11,
    fontFamily: fonts.bodySemi,
  },
  fullChartSidePrice: {
    color: colors.bg,
    fontSize: 14,
    fontFamily: fonts.mono,
    marginTop: 2,
    fontWeight: '700',
  },
  fullChartBuyPrice: {
    color: colors.bg,
    fontSize: 14,
    fontFamily: fonts.mono,
    marginTop: 2,
    fontWeight: '700',
  },
  fullChartLotsPill: {
    position: 'absolute',
    left: '50%',
    bottom: -2,
    width: 54,
    height: 24,
    marginLeft: -27,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(10, 12, 18, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 43,
  },
  fullChartLotsValue: {
    color: colors.ink,
    fontSize: 11,
    fontFamily: fonts.mono,
  },
  fullChartSentimentRow: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  fullChartSentimentBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  fullChartSentimentTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
    overflow: 'hidden',
  },
  fullChartSentimentFill: {
    height: '100%',
    borderRadius: 2,
  },
  fullChartSellFill: {
    backgroundColor: colors.danger,
  },
  fullChartBuyFill: {
    backgroundColor: colors.accent,
  },
  fullChartSentimentText: {
    fontSize: 10,
    fontFamily: fonts.mono,
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  symbolDropdown: {
    position: 'absolute',
    top: 118,
    left: 16,
    width: 220,
    height: 260,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(14,16,22,0.98)',
    zIndex: 20,
    overflow: 'hidden',
  },
  symbolListContent: {
    paddingVertical: 2,
  },
  symbolOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  symbolOptionCode: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  symbolOptionName: {
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    zIndex: 24,
  },
  sheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 14,
    maxHeight: '68%',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(10,12,18,0.98)',
    overflow: 'hidden',
    zIndex: 25,
  },
  sheetHeader: {
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.bodySemi,
  },
  sheetClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    padding: 12,
    paddingBottom: 18,
  },
  sheetSection: {
    marginTop: 10,
    marginBottom: 8,
    color: colors.inkMuted,
    fontSize: 10,
    fontFamily: fonts.bodySemi,
  },
  featureAction: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    paddingHorizontal: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface2,
  },
  featurePressed: {
    opacity: 0.72,
  },
  featureIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bodySemi,
  },
  featureValue: {
    color: colors.inkMuted,
    fontSize: 11,
    fontFamily: fonts.body,
  },
  optionGroup: {
    marginBottom: 12,
  },
  optionLabel: {
    color: colors.inkSecondary,
    fontSize: 12,
    marginBottom: 8,
    fontFamily: fonts.bodySemi,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionChip: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  optionChipText: {
    color: colors.inkSecondary,
    fontSize: 10,
    fontFamily: fonts.bodySemi,
  },
  optionChipTextActive: {
    color: colors.bg,
  },
  selectRow: {
    minHeight: 52,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.inkMuted,
  },
  selectDotActive: {
    backgroundColor: colors.positive,
    borderColor: colors.positive,
  },
  selectCopy: {
    flex: 1,
    minWidth: 0,
  },
  toggleFeatureRow: {
    minHeight: 56,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  switchTrackOn: {
    backgroundColor: colors.accentSoft,
  },
  switchKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.inkMuted,
  },
  switchKnobOn: {
    transform: [{ translateX: 18 }],
    backgroundColor: colors.accent,
  },
  objectToolGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  miniTool: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface2,
  },
  miniToolText: {
    color: colors.inkSecondary,
    fontSize: 10,
    fontFamily: fonts.bodySemi,
  },
  emptyFeatureText: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 12,
  },
  objectRow: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    paddingLeft: 10,
    paddingRight: 6,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  objectMain: {
    flex: 1,
    minWidth: 0,
  },
  objectIconBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricPanel: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: colors.surface2,
  },
  metricTitle: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    marginBottom: 8,
  },
  metricRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineSoft,
  },
  metricLabel: {
    color: colors.inkMuted,
    fontSize: 11,
  },
  metricValue: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 12,
    fontFamily: fonts.mono,
    textAlign: 'right',
  },
  tradeNoticeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '46%',
    alignItems: 'center',
    zIndex: 30,
  },
  tradeNotice: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 36,
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.positive}55`,
    backgroundColor: 'rgba(10, 12, 18, 0.86)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tradeNoticeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.positive,
  },
  tradeNoticeText: {
    fontSize: 13,
    color: '#F8FAFC',
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 64,
    backgroundColor: 'rgba(8,8,12,0.42)',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    zIndex: 15,
  },
  panelHandle: {
    height: PANEL_HANDLE_HEIGHT,
    paddingHorizontal: 16,
    paddingTop: 8,
    alignItems: 'center',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.inkMuted,
    marginBottom: 8,
    opacity: 0.5,
  },
  handleHint: {
    color: colors.inkMuted,
    fontSize: 9,
    fontFamily: fonts.bodySemi,
  },
  quoteRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: 8,
  },
  quoteCell: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  quoteLabel: {
    color: colors.inkMuted,
    fontSize: 9,
    fontFamily: fonts.bodySemi,
  },
  quoteValue: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.mono,
    marginTop: 2,
  },
  panelContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 18,
    gap: 12,
  },
  panelGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sideBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellBtn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  buyBtn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sideLabel: {
    color: colors.bg,
    fontSize: 11,
    fontFamily: fonts.bodySemi,
  },
  sidePrice: {
    color: colors.bg,
    fontSize: 18,
    fontFamily: fonts.mono,
    marginTop: 4,
  },
  buySideLabel: {
    color: colors.bg,
    fontSize: 11,
    fontFamily: fonts.bodySemi,
  },
  buySidePrice: {
    color: colors.bg,
    fontSize: 18,
    fontFamily: fonts.mono,
    marginTop: 4,
  },
  lotsBox: {
    width: 80,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1.2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  lotsControlRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lotStep: {
    width: 22,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotStepText: {
    color: colors.inkSecondary,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
  },
  lotsInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.mono,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 0,
    minWidth: 0,
  },
  lotsLabel: {
    marginTop: -1,
    color: colors.inkMuted,
    fontSize: 7,
    lineHeight: 9,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0,
  },
  orderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  orderMetaText: {
    color: colors.inkMuted,
    fontSize: 10,
  },
  orderMetaStrong: {
    color: colors.ink,
    fontSize: 10,
    fontFamily: fonts.bodySemi,
  },
  positionsWrap: {
    marginTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  positionsTitle: {
    color: colors.inkMuted,
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    marginBottom: 8,
  },
  positionsList: {
    maxHeight: 144,
  },
  emptyPositions: {
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  positionRow: {
    minHeight: 44,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionLeft: {
    flex: 1,
    minWidth: 0,
  },
  positionSide: {
    alignSelf: 'flex-start',
    fontSize: 9,
    fontFamily: fonts.bodySemi,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  buyTag: {
    color: colors.positive,
    borderColor: `${colors.positive}55`,
  },
  sellTag: {
    color: colors.danger,
    borderColor: `${colors.danger}55`,
  },
  positionText: {
    color: colors.inkSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  positionPnl: {
    width: 84,
    textAlign: 'right',
    fontSize: 12,
    fontFamily: fonts.mono,
  },
  closeText: {
    color: colors.danger,
    fontSize: 10,
    fontFamily: fonts.bodySemi,
  },
});
