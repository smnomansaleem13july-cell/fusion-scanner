# AlphaScan Fusion Scanner — Next.js

FUSION_SCRENNER.html ka full website version. Same 6-layer fusion logic
(EMA 18% + Momentum 18% + ICT/SMC 24% + Turtle 16% + Flow 14% + Risk 10%),
lekin analysis ab **server pe** chalti hai with shared caching.

## Rate limit fix kaise hua

- CoinGecko market-cap pages → server cache **10 min** (5 requests / 10 min total, chahe kitne bhi users ho)
- Binance tickers → cache 45s · exchangeInfo → cache 1h · klines → cache 25s per symbol+TF
- In-flight dedupe: same data ek hi baar fetch hota hai, parallel users share karte hain
- CoinGecko fail ho to automatic volume fallback (pehle jaisa)

## Local run

```bash
npm install
npm run dev        # http://localhost:3000
```

## Deploy (free)

**Vercel (sabse easy):**
1. Is folder ko GitHub repo me push karo
2. vercel.com → Add New Project → repo select karo → Deploy
3. Bas. Koi env variable nahi chahiye.

**Railway / Render:** repo connect karo, build command `npm run build`, start `npm start`.

## Structure

```
lib/indicators.js   # RSI, MACD, EMA, BB, OBV, StochRSI, ATR, ADX, S/R, patterns
lib/ict.js          # Swings, structure, BOS/CHoCH, sweeps, OB, FVG, P/D, OTE, KZ, Turtle
lib/fusion.js       # Composite scoring + direction voting + MTF confirm
lib/binance.js      # Multi-base fallback + caching
lib/coingecko.js    # Market-cap universe + volume fallback
lib/cache.js        # TTL cache + request dedupe
app/api/universe    # GET ?count=N → coin list
app/api/scan        # POST batch → analyzed rows
app/page.js         # UI (dark terminal, responsive, mobile OK)
```

## Aage kya add kar sakte ho

- Telegram alerts (A+ signal pe) — `app/api/scan` me hook lagana easy hai
- Auto-rescan interval (cron ya client-side timer)
- Vercel KV / Redis cache agar multiple server instances ho

Note: signals analysis ke liye hain, financial advice nahi.
