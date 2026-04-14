# AI Trading Analysis for MetaTrader

AI Analysis Library + API Server สำหรับ MetaTrader 4/5  
วิเคราะห์ตลาดด้วย AI 47+ models ฟรี ไม่มีค่าใช้จ่าย

```
┌────────────────────────────┐
│   MetaTrader 4/5 EA        │
│   (Your EA or Example EA)  │
│   #include AI_Connector    │
└────────┬───────────────────┘
         │ WinInet.dll POST JSON
         ▼
┌────────────────────────────┐
│   Node.js API Server       │
│   Express + Auth + Helmet  │
│   Cache + Rate Limiting    │
└────────┬───────────────────┘
         │ fetch (OpenAI-compatible)
         ▼
┌────────────────────────────┐
│   AI Providers (Free)      │
│   Pollinations: 26+ models │
│   DeepInfra: 17+ models    │
│   Auto-fallback chain      │
└────────────────────────────┘
```

---

## โครงสร้างไฟล์

```
├── index.js              # API Server หลัก
├── package.json          # Dependencies (Express, Helmet, etc.)
├── .env                  # AI_API_KEY, PORT, BASE_URL
├── test.js               # API test script
└── MQL/
    ├── AI_Connector.mqh  # AI Connector Class (WinInet.dll, MQL4+MQL5)
    ├── AI_Models.mqh     # ENUM_AI_MODEL + ModelToString (auto-gen จาก server)
    ├── Example_EA.mq4    # ตัวอย่าง EA สำหรับ MQL4 พร้อม Dashboard
    └── Example_EA.mq5    # ตัวอย่าง EA สำหรับ MQL5 พร้อม Dashboard
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
  "used_model": "openai",
  "analyzed_at": "2026-04-11T12:00:05.000Z",
  "cached": false
}
```

| Status | ความหมาย |
|--------|----------|
| 200 | สำเร็จ (อาจเป็น cached หรือ fresh) |
| 400 | ขาด field ที่จำเป็น (symbol, timeframe) |
| 401 | API key ไม่ถูกต้อง |
| 429 | เกิน rate limit |
| 500 | AI providers ทั้งหมดล้มเหลว |

---

### Cache System

Server มี built-in cache + request coalescing:

| Timeframe | Cache TTL |
|-----------|-----------|
| M1 | 45 วินาที |
| M5 | 2 นาที |
| M15 | 5 นาที |
| M30 | 10 นาที |
| H1 | 20 นาที |
| H4 | 45 นาที |
| D1 | 2 ชั่วโมง |

- **Request coalescing** — ถ้ามี request ซ้ำขณะ AI กำลังประมวลผล → รอ promise เดียวกัน ไม่ยิงซ้ำ
- ส่ง `no_cache: true` ใน body เพื่อข้าม cache

---

### Developer Endpoints

#### `GET /models/check?hash=<hash>`

ตรวจสอบว่า model list มีอัปเดตหรือไม่

```json
{
  "version": 2,
  "hash": "c412e9a09df1ad02504119c89b215b55",
  "count": 47,
  "outdated": true,
  "download_url": "https://axer-ai.onrender.com/models/mqh"
}
```

#### `GET /models/mqh`

ดาวน์โหลดไฟล์ `AI_Models.mqh` (ENUM + ModelToString) auto-generated จาก server

```bash
curl -o AI_Models.mqh https://axer-ai.onrender.com/models/mqh
```

#### `POST /models/refresh`

บังคับ refresh model list จาก providers (ต้อง auth)

#### `GET /cache` / `DELETE /cache`

ดูสถานะ / ล้าง cache (ต้อง auth)

---

### วิธีอัปเดต Model List

1. เรียก `GET /models/check` → เก็บ `hash`
2. ครั้งถัดไป เรียก `GET /models/check?hash=<hash_เดิม>`
3. ถ้า `outdated: true` → ดาวน์โหลด `GET /models/mqh`
4. บันทึกทับ `AI_Models.mqh` ใน `MQL4/Include/` → Compile EA ใหม่

Server auto-refresh model list จาก Pollinations + DeepInfra ทุก 24 ชม.

---

### AI Provider System

Server ดึง model list อัตโนมัติจาก:
- **Pollinations** (`gen.pollinations.ai/text/models`) — 26+ text models
- **DeepInfra** (`api.deepinfra.com/models/featured`) — 17+ text-generation models

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

## Part 2: MQL Library + Example EA

### ไฟล์ Library

| ไฟล์ | คำอธิบาย |
|------|----------|
| `AI_Connector.mqh` | Class `CAI_Connector` — เชื่อมต่อ AI API ผ่าน WinInet.dll รองรับ MQL4 + MQL5 |
| `AI_Models.mqh` | `ENUM_AI_MODEL` + `ModelToString()` — auto-generated จาก server (`/models/mqh`) |

### ไฟล์ Example

| ไฟล์ | คำอธิบาย |
|------|----------|
| `Example_EA.mq4` | ตัวอย่าง MQL4 EA — AI Analysis + Dashboard Panel (AXER-style dark theme) |
| `Example_EA.mq5` | ตัวอย่าง MQL5 EA — เหมือนกันแต่ใช้ MQL5 syntax (`_Symbol`, `_Digits`, etc.) |

### ติดตั้ง

1. คัดลอก `AI_Models.mqh` + `AI_Connector.mqh` ไปยัง `MQL4/Include/` (หรือ `MQL5/Include/`)
2. คัดลอก `Example_EA.mq4` ไปยัง `MQL4/Experts/` (หรือ `.mq5` → `MQL5/Experts/`)
3. เปิด **MetaEditor** → Compile (F7)
4. **Tools → Options → Expert Advisors:**
   - ✅ Allow DLL imports (ใช้ WinInet.dll สำหรับ HTTP)
5. ลาก EA ไปวางบน Chart

> **หมายเหตุ:** ไม่ต้องเพิ่ม URL ใน WebRequest whitelist — ใช้ WinInet.dll โดยตรง

### Input Parameters (Example EA)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `InpModel` | Auto | เลือก AI Model (dropdown 43+ ตัวเลือก) |
| `CustomModelName` | (ว่าง) | ชื่อ model กำหนดเอง (ใช้กับ MODEL_CUSTOM) |
| `InpApiKey` | (ว่าง) | API Key (ค่าเดียวกับ `AI_API_KEY` ใน `.env`) |
| `PanelX` | 10 | ตำแหน่ง X ของ Dashboard |
| `PanelY` | 20 | ตำแหน่ง Y ของ Dashboard |

### การใช้งานใน EA ของคุณ

```mql4
#include <AI_Models.mqh>
#include <AI_Connector.mqh>

input ENUM_AI_MODEL InpModel   = MODEL_AUTO;
input string        InpApiKey  = "";

CAI_Connector g_ai;

int OnInit()
{
   g_ai.SetApiUrl("https://axer-ai.onrender.com");
   g_ai.SetApiKey(InpApiKey);
   return(INIT_SUCCEEDED);
}

void OnTick()
{
   AI_Result result;
   if(g_ai.AnalyzeCurrentChart(InpModel, 10, result))
   {
      if(result.decision == AI_BUY)
         Print("AI: BUY ", result.confidence, "% - ", result.reason);
      else if(result.decision == AI_SELL)
         Print("AI: SELL ", result.confidence, "% - ", result.reason);
   }
}
```

### CAI_Connector Methods

| Method | คำอธิบาย |
|--------|----------|
| `SetApiUrl(url)` | ตั้ง URL ของ API Server |
| `SetApiKey(key)` | ตั้ง API Key |
| `SetCustomModel(name)` | ตั้งชื่อ model กำหนดเอง |
| `SetTimeout(ms)` | ตั้ง timeout (default: 30000ms) |
| `SetNoCache(bool)` | ส่ง `no_cache` ไป server |
| `GetApiUrl()` | อ่าน URL ปัจจุบัน |
| `CheckHealth(count)` | Health check → คืนจำนวน providers |
| `AnalyzeCurrentChart(model, candles, result)` | วิเคราะห์จากชาร์ตปัจจุบัน (เก็บ indicators อัตโนมัติ) |
| `Analyze(...)` | วิเคราะห์โดยส่งข้อมูลเอง (30+ fields) |

### AI_Result Struct

| Field | Type | คำอธิบาย |
|-------|------|----------|
| `success` | bool | สำเร็จหรือไม่ |
| `decision` | ENUM_AI_DECISION | AI_BUY / AI_SELL / AI_HOLD |
| `confidence` | int | 1-100 |
| `entry_price` | double | ราคาเข้า |
| `stop_loss` | double | Stop Loss |
| `take_profit` | double | Take Profit |
| `reason` | string | เหตุผล (max 180 chars) |
| `risk_level` | ENUM_AI_RISK | LOW / MEDIUM / HIGH |
| `used_model` | string | ชื่อ model ที่ใช้จริง |
| `from_cache` | bool | ผลลัพธ์จาก cache หรือ fresh |

---

## AI Model ที่รองรับ

### Pollinations (26+ models)

| กลุ่ม | Models |
|-------|--------|
| **OpenAI** | openai, openai-fast, openai-large |
| **Gemini** | gemini, gemini-fast, gemini-flash-lite, gemini-large, gemini-search |
| **Claude** | claude-fast, claude, claude-large |
| **Grok** | grok, grok-large |
| **Mistral** | mistral, mistral-large |
| **Nova** | nova, nova-fast |
| **Qwen** | qwen-large, qwen-coder, qwen-coder-large |
| **Perplexity** | perplexity-fast, perplexity-reasoning |
| **อื่นๆ** | deepseek, kimi, glm, minimax |

### DeepInfra (17+ models)

| กลุ่ม | Models |
|-------|--------|
| **Qwen 3.5** | 397B, 122B, 35B, 27B, 9B, 4B, 2B, 0.8B |
| **Qwen 3** | Qwen3 Max, Qwen3 Max Thinking |
| **Gemma** | Gemma 4 26B, Gemma 4 31B |
| **Nemotron** | Nemotron 120B, Nemotron 30B |
| **อื่นๆ** | GLM-5.1, GLM-4.7 Flash, Step 3.5 Flash |

> Model list อัปเดตอัตโนมัติจาก providers — จำนวนอาจเปลี่ยน  
> ใช้ `MODEL_CUSTOM` + `CustomModelName` สำหรับ model ที่ยังไม่อยู่ใน enum

---

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
| **Candles** | 10 แท่ง OHLCV |
| **Positions** | ออเดอร์ที่เปิด (ticket, type, lots, SL, TP, PnL) |

---

## Dashboard (Example EA)

```
┌ SolunaAI ───── Example v1.0 ─ [X] ┐
│                                     │
│  ▲ BULLISH                          │
│  ████████████░░░░  75%              │
│                                     │
│ ┌ AI ANALYSIS ────────────────────┐ │
│ │ Decision: BUY    Risk: MEDIUM   │ │
│ │ Model: openai                   │ │
│ │ [FRESH]  Updated: 14:30         │ │
│ │ Confidence: 75%                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌ KEY LEVELS ─────────────────────┐ │
│ │ Entry: 2345.50    SL: 2340.00   │ │
│ │ TP: 2355.00                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌ REASON ─────────────────────────┐ │
│ │ RSI oversold with MACD bullish  │ │
│ │ crossover near BB lower band    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## License

© Lowcode 2026 — [t.me/Iowcode](https://t.me/Iowcode)

- Pollinations + DeepInfra เป็นบริการฟรี อาจมีช่วงที่ไม่เสถียร — ระบบ auto-fallback จะช่วยลดปัญหานี้
- Request ถี่เกินไป (< 45 วินาที) อาจทำให้ถูก rate limit
- Example EA เป็นตัวอย่าง display-only — ต้องเพิ่ม trade execution logic เอง
