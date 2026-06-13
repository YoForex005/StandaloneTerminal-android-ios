import type { Candle } from './CandlestickChart';

export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H2' | 'H4' | 'H8' | 'D1' | 'W1';

export type MarketSymbol = {
  code: string;
  name: string;
  decimals: number;
  basePrice: number;
  spread: number;
};

export type DemoPosition = {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  currentPrice: number;
  pnl: number;
  openedAt: number;
};

export const SYMBOLS: Record<string, MarketSymbol> = {
  EURUSD: { code: 'EURUSD', name: 'Euro / US Dollar', decimals: 4, basePrice: 1.0842, spread: 0.0004 },
  GBPUSD: { code: 'GBPUSD', name: 'Pound / US Dollar', decimals: 4, basePrice: 1.2614, spread: 0.0006 },
  XAUUSD: { code: 'XAUUSD', name: 'Gold / US Dollar', decimals: 2, basePrice: 2308.42, spread: 0.45 },
  USDJPY: { code: 'USDJPY', name: 'US Dollar / Yen', decimals: 2, basePrice: 156.84, spread: 0.05 },
  BTCUSD: { code: 'BTCUSD', name: 'Bitcoin / US Dollar', decimals: 0, basePrice: 58428, spread: 12 },
};

export const SYMBOL_LIST = Object.values(SYMBOLS);

export const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H2', 'H4', 'H8', 'D1', 'W1'];

export const TF_MINUTES: Record<Timeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H2: 120,
  H4: 240,
  H8: 480,
  D1: 1440,
  W1: 10080,
};

export const roundTo = (n: number, decimals: number) => {
  const multiplier = Math.pow(10, decimals);
  return Math.round(n * multiplier) / multiplier;
};

const hashSeed = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed: string) => {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const randomCentered = (rand: () => number) => (rand() + rand() + rand() + rand()) / 2 - 1;

export const generateCandles = (symbol: MarketSymbol, tf: Timeframe, count = 120): Candle[] => {
  const rand = seededRandom(`${symbol.code}-${tf}`);
  const tfMs = TF_MINUTES[tf] * 60 * 1000;
  const lastOpenTime = Math.floor(Date.now() / tfMs) * tfMs;
  const candles: Candle[] = [];
  let price = symbol.basePrice * (1 + (rand() - 0.5) * 0.002);
  let momentum = 0;
  const volatility = 0.00026 * Math.min(5, Math.sqrt(TF_MINUTES[tf]));
  const tickSize = Math.pow(10, -symbol.decimals);

  for (let index = 0; index < count; index++) {
    const time = lastOpenTime - (count - 1 - index) * tfMs;
    const open = price;
    const noise = randomCentered(rand);
    const swing = Math.sin(index / 5.8 + rand() * 0.8) * volatility * 0.35;
    const pullback = ((symbol.basePrice - open) / symbol.basePrice) * 0.045;
    momentum = momentum * 0.42 + noise * volatility + swing + pullback;
    const close = Math.max(tickSize, open * (1 + momentum));
    const wickRange = open * (volatility * (0.45 + Math.abs(randomCentered(rand)) * 1.15));
    const high = Math.max(open, close) + wickRange;
    const low = Math.max(tickSize, Math.min(open, close) - wickRange * (0.75 + rand() * 0.5));

    candles.push({
      time,
      open: roundTo(open, symbol.decimals),
      close: roundTo(close, symbol.decimals),
      high: roundTo(Math.max(high, open, close), symbol.decimals),
      low: roundTo(Math.min(low, open, close), symbol.decimals),
      volume: Math.round(60000 + Math.abs(noise) * 130000 + rand() * 45000),
    });
    price = close;
  }

  return candles;
};

export const tickCandles = (candles: Candle[], symbol: MarketSymbol, tf: Timeframe): Candle[] => {
  if (candles.length === 0) return generateCandles(symbol, tf);
  const tfMs = TF_MINUTES[tf] * 60 * 1000;
  const bucketTime = Math.floor(Date.now() / tfMs) * tfMs;
  const next = [...candles];
  const last = next[next.length - 1];
  const drift = (Math.random() * 2 - 1) * last.close * 0.00028;
  const close = roundTo(Math.max(Math.pow(10, -symbol.decimals), last.close + drift), symbol.decimals);

  if (last.time < bucketTime) {
    return [
      ...next.slice(-119),
      {
        time: bucketTime,
        open: last.close,
        close,
        high: Math.max(last.close, close),
        low: Math.min(last.close, close),
        volume: 1,
      },
    ];
  }

  next[next.length - 1] = {
    ...last,
    close,
    high: Math.max(last.high, close),
    low: Math.min(last.low, close),
    volume: last.volume + 1,
  };
  return next;
};

export const positionPnl = (position: DemoPosition, currentPrice: number): number => {
  const direction = position.side === 'BUY' ? 1 : -1;
  const isFx = position.symbol !== 'XAUUSD' && position.symbol !== 'BTCUSD' && position.symbol !== 'USDJPY';
  const isMetal = position.symbol === 'XAUUSD';
  const contractMultiplier = isFx ? 100000 : isMetal ? 100 : 1;
  const divisor = isFx ? 1000 : 10;
  return Number(
    (((currentPrice - position.openPrice) * direction * position.lots * contractMultiplier) / divisor).toFixed(2),
  );
};
