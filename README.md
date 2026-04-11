# AXER AI Trading System

ระบบเทรดอัตโนมัติ AXER EA + AI Analysis Server  
AI วิเคราะห์เทรนด์และให้ Decision (BUY/SELL/HOLD) ผ่าน g4f.space ฟรี 12 providers

```
┌─────────────────────────┐
│   MetaTrader 4 (AXER)   │
│   Hedging + Grid + News │
│   AI Trend Filter       │
└────────┬────────────────┘
         │ WebRequest POST JSON
         ▼
┌─────────────────────────┐
│   Node.js API Server    │
│   Express + Auth        │
└────────┬────────────────┘
         │ fetch (OpenAI-compatible)
         ▼
┌─────────────────────────┐
│   g4f.space Free API    │
│   12 providers fallback │
│   gemini → groq → poll. │
└─────────────────────────┘
```

---

# Part 1: API Server

Node.js Express server รับข้อมูลจาก EA แล้วส่งต่อให้ AI วิเคราะห์

## โครงสร้างไฟล์

```
├── index.js          # API Server หลัก
├── package.json      # Dependencies
├── .env              # AI_API_KEY, PORT
├── test.js           # ตัวทดสอบ API
└── MQL/
    ├── AXER AI.mq4         # AXER EA (AI-integrated)
    ├── AI_Connector.mq4    # Standalone AI Connector (MT4)
    └── AI_Connector.mq5    # Standalone AI Connector (MT5)
```

## ติดตั้ง

```bash
cd "API EA AI"
npm install
```

## ตั้งค่า `.env`

```env
AI_API_KEY="EAAITESTKEY12345#"
PORT=8000
```

> `AI_API_KEY` ใช้ยืนยันตัวตนระหว่าง EA กับ Server (ไม่เกี่ยวกับ AI provider — g4f.space ฟรีไม่ต้องใช้ key)

## รัน Server

```bash
npm start          # Production
npm run dev        # Development (auto-reload)
```

```
SolunaAI Trading API running on port 8000
g4f fallback chain: 12 providers
```

## API Endpoints

### `GET /health`

Health check (ไม่ต้อง auth)

```json
{ "status": "ok", "timestamp": "2026-04-11T12:00:00.000Z" }
```

### `POST /analyze`

วิเคราะห์ตลาดด้วย AI

**Headers:**

| Key | Value |
|-----|-------|
| `Content-Type` | `application/json` |
| `x-api-key` | ค่าเดียวกับ `AI_API_KEY` ใน `.env` |

**Body:** JSON payload จาก EA (30+ fields — ดูหัวข้อ Data Fields)

**Response (200):**

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
  "used_model": "gemini/models/gemini-2.5-flash",
  "raw": "...",
  "analyzed_at": "2026-04-11T12:00:05.000Z"
}
```

**Error (401):** `{ "success": false, "message": "Unauthorized" }`  
**Error (500):** `{ "success": false, "error": "All providers failed..." }`

## Provider Fallback Chain

เรียงลำดับ: ฟรีก่อน → Pollinations ทีหลัง  
ถ้ามี `preferred_model` จะลองตัวนั้นก่อน  
เจอ 429 (Rate Limit) หยุดทันที ไม่ลองต่อ

| # | Endpoint | Model | หมายเหตุ |
|---|----------|-------|----------|
| 1 | gemini | gemini-2.5-flash | ฟรี แนะนำ |
| 2 | groq | llama-3.3-70b-versatile | ฟรี |
| 3 | groq | qwen/qwen3-32b | ฟรี |
| 4 | groq | openai/gpt-oss-120b | ฟรี |
| 5 | pollinations | openai | อาจต้องใช้ credits |
| 6 | pollinations | deepseek | |
| 7 | pollinations | openai-large | |
| 8 | pollinations | claude-fast | |
| 9 | pollinations | grok | |
| 10 | pollinations | gemini-fast | |
| 11 | pollinations | mistral | |
| 12 | pollinations | kimi | |

## ทดสอบ

```bash
# เปิด Server ก่อน แล้วรัน:
node test.js              # ใช้ Auto model
node test.js deepseek     # ระบุ model
node test.js gemini-2.5-flash
```

## Deploy (Render)

1. Push โค้ดขึ้น GitHub
2. สร้าง Web Service บน [render.com](https://render.com)
3. ตั้ง Build Command: `npm install`
4. Start Command: `npm start`
5. เพิ่ม Environment Variable: `AI_API_KEY`

---

# Part 2: AXER AI EA (MQL4)

EA เทรดอัตโนมัติแบบ Hedging + Grid Recovery พร้อม AI Trend Analysis

## Features

| Feature | Description |
|---------|-------------|
| **AI Trend Filter** | ใช้ AI (g4f.space) วิเคราะห์เทรนด์แทน SMA เดิม |
| **Hedging Grid** | เปิดออเดอร์ทั้ง Buy/Sell ตาม candle direction |
| **ATR Recovery Layer** | เพิ่ม lot size เมื่อ drawdown ถึงระยะ ATR |
| **Auto Netting** | ปิดคู่ออเดอร์ที่ imbalance เมื่อ ATR ต่ำ |
| **Trend Pruning** | ปิดออเดอร์สวนเทรนด์ที่มีกำไร |
| **News Filter** | หยุดเปิดออเดอร์ช่วงข่าว (FXStreet calendar) |
| **NFP Protection** | หยุด 3 ชม. ก่อน/หลัง Non-Farm Payrolls |
| **Dashboard** | แสดง Trend, S/R, Account, Profit บนชาร์ต |
| **AI Panel** | แสดง AI Decision, Confidence, Reason, Entry/SL/TP |
| **Push Notifications** | แจ้งเตือนปิดออเดอร์ + Daily Summary |
| **Logging** | บันทึกทุก action ลงไฟล์ .log |

## ติดตั้ง EA

1. คัดลอก `AXER AI.mq4` ไปยัง `MQL4/Experts/`
2. เปิด **MetaEditor** กด **Compile** (F7)
3. **Tools → Options → Expert Advisors**
   - ✅ Allow DLL imports (ใช้ Wininet.dll สำหรับข่าว)
   - ✅ Allow WebRequest for listed URL
   - เพิ่ม: `https://your-app.onrender.com`
   - เพิ่ม: `http://calendar.fxstreet.com`
4. ลาก EA ไปวางบน Chart

## ตั้งค่า API (Hardcoded)

แก้ไขค่าในโค้ดก่อน Compile:

```mql4
string   AI_API_URL  = "https://your-app-name.onrender.com/analyze";  // ← แก้ URL
string   AI_API_KEY  = "EAAITESTKEY12345";                            // ← แก้ Key ให้ตรงกับ .env
```

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
