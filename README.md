# AXER AI Trading System

ระบบเทรดอัตโนมัติ MetaTrader EA + AI Analysis Server  
AI วิเคราะห์ตลาดและให้สัญญาณ BUY/SELL/HOLD ผ่าน Pollinations + DeepInfra (ฟรี 47+ models)

```
┌────────────────────────────┐
│   MetaTrader 4 (AXER EA)  │
│   Hedging + Grid + News   │
│   AI Trend Filter          │
└────────┬───────────────────┘
         │ WinInet POST JSON
         ▼
┌────────────────────────────┐
│   Node.js API Server       │
│   Express + Auth + Helmet  │
│   Rate Limiting            │
└────────┬───────────────────┘
         │ fetch (OpenAI-compatible)
         ▼
┌────────────────────────────┐
│   AI Providers (Free)      │
│   Pollinations: 26 models  │
│   DeepInfra: 21 models     │
│   Auto-fallback chain      │
└────────────────────────────┘
```

---

## โครงสร้างไฟล์

```
├── index.js              # API Server หลัก
├── package.json          # Dependencies
├── .env                  # AI_API_KEY, PORT
└── MQL/
    ├── AXER AI.mq4       # AXER EA (AI-integrated)
    ├── AI_Models.mqh     # ENUM + ModelToString (auto-gen จาก server)
    ├── AI_Connector.mq4  # Standalone AI Connector (MT4)
    └── AI_Connector.mq5  # Standalone AI Connector (MT5)
```

---

## Part 1: API Server

### ติดตั้ง

```bash
git clone https://github.com/lowcode-np/API-EA-AI.git
cd API-EA-AI
npm install
```

### ตั้งค่า `.env`

```env
AI_API_KEY=your-secret-api-key-here
PORT=8000
BASE_URL=https://axer-ai.onrender.com
```

| ตัวแปร | คำอธิบาย |
|--------|----------|
| `AI_API_KEY` | API key สำหรับ auth ระหว่าง EA ↔ Server |
| `PORT` | พอร์ตที่ server listen (default: 8000) |
| `BASE_URL` | URL สำหรับ `/models/check` download link |

### รัน Server

```bash
npm start        # Production
npm run dev      # Dev (auto-reload)
```

### Security Features

- **Helmet** — Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- **Rate Limiting** — 30 req/min ต่อ IP สำหรับ `/analyze`, 120 req/min global
- **Timing-safe auth** — ป้องกัน timing attack บน API key
- **Input validation** — ตรวจ required fields ก่อนประมวลผล
- **Request timeout** — 30s timeout ต่อ AI provider call
- **Sanitized model name** — ป้องกัน log injection

---

### API Endpoints

#### `GET /health`

Health check (ไม่ต้อง auth)

```json
{ "status": "ok", "providers": 47, "timestamp": "2026-04-11T12:00:00.000Z" }
```

#### `GET /models`

แสดง model ทั้งหมดที่ใช้ได้ (ไม่ต้อง auth)

```json
{
  "count": 47,
  "models": [
    { "model": "openai", "provider": "pollinations" },
    { "model": "Qwen/Qwen3.5-27B", "provider": "deepinfra" }
  ]
}
```

#### `POST /analyze`

วิเคราะห์ตลาดด้วย AI (ต้อง auth, rate limited 30/min)

**Headers:**

| Key | Value |
|-----|-------|
| `Content-Type` | `application/json` |
| `x-api-key` | ค่าเดียวกับ `AI_API_KEY` ใน `.env` |

**Response:**

```json
{
  "success": true,
  "ai_analysis": {
    "decision": "BUY",
    "confidence": 75,
    "entry_price": 2345.50,
    "stop_loss": 2340.00,
    "take_profit": 2355.00,
    "reason": "RSI oversold with MACD bullish crossover",
    "risk_level": "MEDIUM",
    "key_levels": { "support": 2338.00, "resistance": 2360.00 }
  },
  "used_model": "pollinations/openai",
  "analyzed_at": "2026-04-11T12:00:05.000Z"
}
```

| Status | ความหมาย |
|--------|----------|
| 200 | สำเร็จ |
| 400 | ขาด field ที่จำเป็น (symbol, timeframe) |
| 401 | API key ไม่ถูกต้อง |
| 429 | เกิน rate limit |
| 500 | AI providers ทั้งหมดล้มเหลว |

---

### Developer Endpoints (สำหรับผู้พัฒนา)

#### `GET /models/check`

ตรวจสอบว่า model list มีอัปเดตหรือไม่

```
GET /models/check?hash=<hash_เดิม>
```

```json
{
  "version": 2,
  "hash": "c412e9a09df1ad02504119c89b215b55",
  "count": 47,
  "updated_at": "2026-04-11T12:00:00.000Z",
  "outdated": true,
  "download_url": "https://axer-ai.onrender.com/models/mqh"
}
```

| Field | คำอธิบาย |
|-------|----------|
| `version` | เลข version (เพิ่มทุกครั้งที่ model list เปลี่ยน) |
| `hash` | MD5 hash ของ model list ปัจจุบัน |
| `outdated` | `true` ถ้า hash ที่ส่งมาไม่ตรงกับ server |
| `download_url` | URL สำหรับดาวน์โหลด .mqh ใหม่ |

#### `GET /models/mqh`

ดาวน์โหลดไฟล์ `AI_Models.mqh` (ENUM + ModelToString)

```bash
curl -o AI_Models.mqh https://axer-ai.onrender.com/models/mqh
```

Response Headers:
- `X-Model-Hash` — hash ปัจจุบัน (เก็บไว้ใช้กับ `/models/check`)
- `X-Model-Version` — เลข version

#### `POST /models/refresh`

บังคับ refresh model list จาก providers (ต้อง auth)

```bash
curl -X POST -H "x-api-key: YOUR_KEY" https://axer-ai.onrender.com/models/refresh
```

---

### วิธีอัปเดต Model List (สำหรับผู้พัฒนา)

1. เรียก `GET /models/check` → เก็บ `hash`
2. ครั้งถัดไป เรียก `GET /models/check?hash=<hash_เดิม>`
3. ถ้า `outdated: true` → ดาวน์โหลด `GET /models/mqh`
4. บันทึกทับ `AI_Models.mqh` → Compile EA ใหม่

Server จะ auto-refresh model list จาก Pollinations + DeepInfra ทุก 24 ชม.

---

### AI Provider System

Server ดึง model list อัตโนมัติจาก:
- **Pollinations** (`gen.pollinations.ai/text/models`) — 26+ text models
- **DeepInfra** (`api.deepinfra.com/models/featured`) — 21+ text-generation models

**Smart Matching:** เมื่อ EA ส่ง `preferred_model`:
1. exact match → ใช้ model นั้นเลย
2. partial match → เช่น "deepseek" จะ match "deepseek-ai/DeepSeek-V3.2"
3. ไม่เจอ → inject เป็น Pollinations ลองส่งตรง (รองรับ model ใหม่)
4. ล้มเหลว → fallback ไปยัง model ถัดไปตามลำดับ
5. เจอ 429 rate limit → หยุดทันที ไม่ลองต่อ

---

### Deploy (Render)

1. Push โค้ดขึ้น GitHub
2. สร้าง Web Service บน [render.com](https://render.com)
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables: `AI_API_KEY`, `PORT`, `BASE_URL`

---

## Part 2: AXER AI EA (MQL4)

EA เทรดอัตโนมัติแบบ Hedging + Grid Recovery พร้อม AI Trend Analysis

### Features

| Feature | Description |
|---------|-------------|
| **AI Trend Filter** | AI วิเคราะห์เทรนด์ 47+ models |
| **Hedging Grid** | เปิด Buy/Sell ตาม candle direction |
| **ATR Recovery** | เพิ่ม lot size เมื่อ drawdown ถึงระยะ ATR |
| **Auto Netting** | ปิดคู่ออเดอร์ที่ imbalance เมื่อ ATR ต่ำ |
| **News Filter** | หยุดเปิดช่วงข่าว (FXStreet calendar) |
| **NFP Protection** | หยุด 3 ชม. ก่อน/หลัง Non-Farm Payrolls |
| **Dashboard** | แสดง Trend, S/R, Account, AI Status |

### ติดตั้ง EA

1. คัดลอก `AXER AI.mq4` + `AI_Models.mqh` ไปยัง `MQL4/Experts/`
2. เปิด **MetaEditor** → Compile (F7)
3. **Tools → Options → Expert Advisors:**
   - ✅ Allow DLL imports
   - ✅ Allow WebRequest for listed URL
   - เพิ่ม: `https://axer-ai.onrender.com`
   - เพิ่ม: `http://calendar.fxstreet.com`
4. ลาก EA ไปวางบน Chart

### ตั้งค่า API (ในโค้ด)

```mql4
string AI_API_URL = "https://axer-ai.onrender.com/analyze";
string AI_API_KEY = "your-secret-api-key-here";
```

### AI Model Selection

เลือกได้จาก dropdown ใน EA Input:

| กลุ่ม | Models |
|-------|--------|
| **Pollinations** | OpenAI, Gemini, Claude, Grok, Mistral, Nova, Qwen, Perplexity |
| **Shared** | DeepSeek, Kimi, GLM, MiniMax (auto-fallback ทั้ง 2 provider) |
| **DeepInfra** | Qwen3.5 (8 sizes), Qwen3 Max, Gemma 4, Nemotron, GLM-5.1, Step |
| **Custom** | พิมพ์ชื่อ model เองใน `CustomModelName` |

---

## License

MIT

## Input Parameters

### Strategy

| Parameter | Default | Description |
|-----------|---------|-------------|
| `AllowTrade` | Buy and Sell | Buy only / Sell only / No trade |

### Account & Lot Sizing

| Parameter | Default | Description |
|-----------|---------|-------------|
| `LotSizingMethod` | Dynamic (Balance) | Fixed / Balance / Equity / Deposit Load |
| `Risk` | 0.01 | Fixed lot หรือ Risk % |
| `Dynamic` | 10000 | Dynamic Lot Divisor |
| `DepositLoad` | 2.0% | Deposit Load % |
| `MaxLot` | 99.0 | Maximum lot |
| `InitialRecoveryLayer` | 1 | Recovery Layer เริ่มต้น |
| `MagicNumber` | 2486 | Magic Number |

### Entry Filters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MaxSpreadPips` | 120 | Max Spread (Points) |
| `EMAPeriod` | 4 | Local SMA Period |
| `TrendTimeframe` | H1 | Trend Filter TF (fallback เมื่อไม่มี AI) |
| `TrendMAPeriod` | 4 | Trend Filter SMA (fallback) |
| `ATRPeriod` | 20 | ATR Period |
| `MinCandleBodyPct` | 0.5 | Min Candle Body / ATR |

### Profit & Daily Target

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ProfitTargetMode` | % of balance | % Balance หรือ Fixed $ |
| `ProfitTargetPct` | 0.3% | Target Profit (%) |
| `FixedProfitTarget` | $30 | Target Profit ($) |
| `DailyTargetMode` | % of balance | |
| `DailyTargetPct` | 10% | Daily Limit (%) |
| `DailyTargetTarget` | $1000 | Daily Limit ($) |

### Grid Netting

| Parameter | Default | Description |
|-----------|---------|-------------|
| `EnableNetting` | true | เปิด Auto Netting |
| `NettingMinOrders` | 20 | จำนวนออเดอร์ขั้นต่ำ |
| `NettingATRLimit` | 0.002 | ATR ต่ำกว่านี้จึง Netting |
| `NettingMinImbalance` | 3 | ส่วนต่าง Buy-Sell ขั้นต่ำ |
| `PruningMinProfit` | $1 | กำไรขั้นต่ำสำหรับ Prune คู่ |

### News Filter

| Parameter | Default | Description |
|-----------|---------|-------------|
| `NEWS_FILTER` | true | เปิด/ปิด News Filter |
| `NEWS_IMPOTANCE_HIGH` | true | กรองข่าว High Impact |
| `HighMinutesBefore/After` | 60/60 | ช่วงเวลาก่อน/หลังข่าว (นาที) |
| `UseNFPFilter` | true | NFP Protection |
| `NFPMinutesBefore/After` | 180/180 | ช่วงก่อน/หลัง NFP (นาที) |
| `DRAW_NEWS_LINES` | true | วาดเส้นข่าวบนชาร์ต |

### AI Analysis

| Parameter | Default | Description |
|-----------|---------|-------------|
| `InpModel` | Auto | เลือก AI Model (dropdown 13 ตัวเลือก) |

## วิธีทำงาน

### AI Trend Filter

```
ทุกแท่ง H1 ใหม่
    │
    ▼
EA ส่ง JSON (30+ fields) → API Server → g4f.space AI
    │
    ▼
AI ตอบ: BUY/SELL/HOLD + confidence + reason
    │
    ▼
EA เก็บผลลัพธ์:
  • g_aiTrend = BULLISH / BEARISH / SIDEWAYS
  • g_aiConfidence = 1-100
  • g_aiReason = "..."
    │
    ▼
CheckCandleEntry():
  ถ้า AI ตอบแล้ว → ใช้ AI trend filter
  ถ้า AI ยังไม่ตอบ → fallback ใช้ SMA filter เดิม
```

### Dashboard AI Panel

กดปุ่ม **[AI]** บน Dashboard เพื่อเปิดหน้าต่าง:

```
┌ AI ANALYSIS ────────────┐
│ Model: gemini/2.5-flash │
│ Decision: BUY           │
│ Trend: BULLISH          │
│ Confidence: 75%         │
│ Risk: MEDIUM            │
│                         │
│ Entry: 2345.50          │
│ SL: 2340.00             │
│ TP: 2355.00             │
│ R2: 2368.50             │
│ R1: 2360.00             │
│ S1: 2338.00             │
│ S2: 2318.20             │
│                         │
│ RSI oversold at 28 with │
│ MACD bullish crossover  │
│ near BB lower band...   │
└─────────────────────────┘
```

## Data ที่ส่งให้ AI

| หมวด | Fields |
|------|--------|
| **Price** | bid, ask, spread, digits |
| **Daily** | day_open, day_change, day_change_pct |
| **MA** | ma20, ma50, ma200 |
| **Momentum** | rsi, macd_main/signal/histogram, stoch_k/d |
| **Volatility** | atr, bb_upper/middle/lower |
| **S/R** | recent_high, recent_low (50-bar) |
| **Trend** | Auto-detect: STRONG_UP/UP/SIDEWAYS/DOWN/STRONG_DOWN |
| **Account** | balance, equity, free_margin |
| **Candles** | 10 แท่ง H1 OHLCV |
| **Positions** | ออเดอร์ที่เปิด (ticket, type, lots, SL, TP, PnL) |

## AI Model ที่เลือกได้

| # | Model | Type |
|---|-------|------|
| 0 | Auto | Server เลือกให้ |
| 1 | Gemini 2.5 Flash | ฟรี แนะนำ |
| 2 | LLaMA 3.3 70B | ฟรี |
| 3 | Qwen3 32B | ฟรี |
| 4 | GPT-OSS 120B | ฟรี |
| 5 | OpenAI (GPT) | Pollinations |
| 6 | DeepSeek | Pollinations |
| 7 | OpenAI Large | Pollinations |
| 8 | Claude Fast | Pollinations |
| 9 | Grok | Pollinations |
| 10 | Gemini Fast | Pollinations |
| 11 | Mistral | Pollinations |
| 12 | Kimi | Pollinations |

---

## License

© Lowcode 2026 — [t.me/Iowcode](https://t.me/Iowcode)
- g4f.space เป็นบริการฟรี อาจมีช่วงที่ไม่เสถียร — ระบบ auto-fallback จะช่วยลดปัญหานี้
- Cooldown ที่ต่ำเกินไป (< 60 วินาที) อาจทำให้ถูก rate limit
- EA ยังไม่มีระบบเปิด/ปิดออเดอร์อัตโนมัติ — ต้องเพิ่ม trade execution logic เอง
