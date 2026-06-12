# YoPips Terminal Standalone

Backend-free Expo terminal UI that can be copied into another React Native app.

This package is intentionally isolated from the main YoPips app. It does not import auth, API clients, WebSockets, MT5 services, secure storage, navigation, or backend configuration. BUY/SELL creates local demo positions only.

## Folder Contents

- `App.tsx` - minimal Expo entry for running this folder directly.
- `index.js` - Expo root registration entry.
- `.env.example` - optional defaults for mock mode.
- `package.json` - dependencies needed by the standalone terminal.
- `src/terminal/StandaloneTerminal.tsx` - complete terminal screen and trade panel.
- `src/terminal/CandlestickChart.tsx` - interactive candle chart with right-side price gap.
- `src/terminal/mockMarket.ts` - local symbols, mock candles, live tick simulation, and demo P/L.
- `src/terminal/theme.ts` - local colors, fonts, and radius tokens.
- `src/terminal/useFadeIn.ts` - tiny animation helper.

## Run This Folder Directly

```bash
cd terminal-standalone
npm install
npm run start
```

On web, `App.tsx` shows the terminal inside a centered phone container for preview/testing. On Android and iOS, it renders full screen.

If you copy only `src/terminal` into another app, the phone preview frame is not included. The frame lives in `App.tsx`.

## Integrate Into Another Expo App

1. Copy this folder into your other app:

```text
terminal-standalone/src/terminal
```

Recommended destination:

```text
your-other-app/src/terminal
```

2. Install required dependencies in the other app:

```bash
npm install @expo/vector-icons expo-font @expo-google-fonts/inter @expo-google-fonts/jetbrains-mono react-native-safe-area-context react-native-svg
```

If your app does not already use Expo, replace `@expo/vector-icons` with your icon system or install Expo vector icons according to your setup.

3. Make sure the root app is wrapped with `SafeAreaProvider`.

```tsx
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StandaloneTerminal } from './src/terminal/StandaloneTerminal';

export default function App() {
  return (
    <SafeAreaProvider>
      <StandaloneTerminal />
    </SafeAreaProvider>
  );
}
```

4. Or add it as a screen in React Navigation:

```tsx
import { StandaloneTerminal } from '../terminal/StandaloneTerminal';

<Stack.Screen
  name="Terminal"
  component={StandaloneTerminal}
  options={{ headerShown: false }}
/>
```

## Optional Env

Create `.env` in the target app if you want defaults:

```env
EXPO_PUBLIC_TERMINAL_MODE=mock
EXPO_PUBLIC_DEFAULT_SYMBOL=EURUSD
EXPO_PUBLIC_DEFAULT_LOTS=0.50
```

The standalone terminal works without these values.

## What Works Without Backend

- Live-looking candle chart.
- Symbol switcher.
- Timeframe switcher.
- One-click BUY/SELL.
- Local open positions.
- Local P/L updates.
- Close local demo positions.
- Animated trade notification that moves from BUY/SELL toward the center.

## What Does Not Happen

- No real trade is placed.
- No WebSocket is opened.
- No REST API is called.
- No MT5 credentials are used.
- No login/session/auth is required.
- Positions disappear when the screen/app resets because they are local state.

## Replace Mock Logic Later

When you want to connect this standalone terminal to a real backend later, keep the UI and replace the local functions in `StandaloneTerminal.tsx`:

- Replace `generateCandles()` / `tickCandles()` with backend candle and tick data.
- Replace `placeDemoTrade()` with your real order function.
- Replace `closePosition()` with your real close-position function.
- Replace `positions` local state with backend account summary/open positions.

Suggested adapter shape:

```ts
type TerminalAdapter = {
  subscribePrices: (symbol: string, timeframe: string) => () => void;
  placeOrder: (input: {
    side: 'buy' | 'sell';
    symbol: string;
    volume: number;
    orderType: 'market';
  }) => Promise<void>;
  closePosition: (id: string) => Promise<void>;
};
```

Keep the UI notification behavior separate from the adapter so the same motion works for mock and real trading.

## Dependency Checklist

Minimum runtime dependencies:

```json
{
  "@expo/vector-icons": "^15.0.2",
  "expo-font": "~14.0.12",
  "@expo-google-fonts/inter": "^0.4.2",
  "@expo-google-fonts/jetbrains-mono": "^0.4.1",
  "react-native-safe-area-context": "~5.6.2",
  "react-native-svg": "15.12.1"
}
```

If running this as its own Expo app, use the included `package.json`.

## File Copy Checklist

Copy all of these together:

```text
src/terminal/StandaloneTerminal.tsx
src/terminal/CandlestickChart.tsx
src/terminal/mockMarket.ts
src/terminal/theme.ts
src/terminal/useFadeIn.ts
```

Do not copy backend files from the main app unless you specifically want real backend integration.
