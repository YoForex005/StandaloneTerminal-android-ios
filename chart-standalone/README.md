# Standalone Candlestick Chart

This is a dependency-free browser chart app.

It does not need:

- backend
- API
- WebSocket
- React
- React Native
- Expo
- npm install
- external chart library

## Run

Open this file directly in a browser:

```text
index.html
```

Or serve the folder with any static server:

```bash
python -m http.server 8090
```

Then open:

```text
http://localhost:8090
```

## Files

```text
index.html
```

Everything is inside that one file: HTML, CSS, JavaScript, mock candle generator, live tick simulation, pan, zoom, symbol selector, timeframe selector, price scale, and current-price label.

## Integrate Into Another App

Because this is plain browser code, you can integrate it in three simple ways:

1. Use it as a standalone static page.
2. Put `index.html` inside a WebView.
3. Copy the JavaScript canvas chart logic into your own web app.

## Backend

There is no backend connection. The chart uses generated mock data and updates locally.

To connect real data later, replace:

```js
generateCandles(...)
tick(...)
```

with your own feed adapter.
