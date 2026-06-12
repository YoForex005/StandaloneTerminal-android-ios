# Full Trading Chart Page

Dependency-free browser trading terminal page.

It includes:

- full candlestick chart
- mock live candles
- symbol selector
- timeframe selector
- one-click demo BUY/SELL
- lot size stepper/input
- open positions list
- local P/L updates
- close position action
- animated trade notification

It does not use:

- backend
- API
- WebSocket
- React
- React Native
- Expo
- npm install
- external chart library

## Run

Open:

```text
index.html
```

directly in your browser.

Or serve the folder:

```bash
python -m http.server 8090
```

Then open:

```text
http://localhost:8090
```

## Integrate

Use this as a static page, put it inside a WebView, or copy the canvas/trade logic into another web app.

To connect real trading later, replace the mock functions:

```js
generateCandles()
tick()
placeTrade()
closePosition()
```

with your real data/order adapter.
