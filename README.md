<div align="center">

<img src="https://img1.pic.in.th/images/Gemini_Generated_Image_qovfwqqovfwqqovf.png" width="800" />

# 🤖 AI Trading Analysis for MetaTrader

### ระบบวิเคราะห์การเทรดด้วย AI สำหรับ MetaTrader 4/5

**34+ AI Models | Free Forever | Auto-Fallback | MQL4/5 Compatible**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![MetaTrader](https://img.shields.io/badge/MetaTrader-4%20%7C%205-blue.svg)](https://www.metatrader4.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[📚 Documentation](#documentation) • [🚀 Quick Start](#quick-start) • [🎯 Features](#features) • [💬 Telegram](https://t.me/Iowcode)

</div>

---

## 🎯 Overview

**AI Trading Analysis** เป็นระบบวิเคราะห์การเทรดด้วย AI ที่ออกแบบมาสำหรับ MetaTrader 4/5 โดยเฉพาะ รองรับ **34+ AI Models** จาก Pollinations และ DeepInfra **ฟรี 100%** พร้อมระบบ auto-fallback และ caching ที่ชาญฉลาด

```
┌─────────────────────────────┐
│   MetaTrader 4/5 EA         │
│   #include AI_Connector     │
│   ┌───────────────────────┐ │
│   │ Your Trading Logic    │ │
│   └───────────────────────┘ │
└──────────┬──────────────────┘
           │ WinInet.dll (HTTP POST)
           ▼
┌─────────────────────────────┐
│   Node.js API Server        │
│   • Express + Helmet        │
│   • Rate Limiting           │
│   • Smart Cache System      │
│   • Request Coalescing      │
└──────────┬──────────────────┘
           │ OpenAI-Compatible API
           ▼
┌─────────────────────────────┐
│   Free AI Providers         │
│   ├─ Pollinations (26+)     │
│   └─ DeepInfra (17+)        │
│                             │
│   Auto-Fallback Chain       │
└─────────────────────────────┘
```

---

## ✨ Features

### 🚀 Core Features
- ✅ **34+ AI Models** - GPT-4, Claude, Gemini, DeepSeek และอีกมากมาย
- ✅ **100% Free** - ใช้ Free tier จาก Pollinations + DeepInfra
- ✅ **Auto-Fallback** - หาก model หนึ่งล้มเหลว จะลองถัดไปอัตโนมัติ
- ✅ **Smart Caching** - ลด API calls ด้วย TTL ที่ปรับตาม timeframe
- ✅ **Request Coalescing** - รวม duplicate requests เป็นหนึ่งเดียว
- ✅ **MQL4 + MQL5** - รองรับทั้งสองเวอร์ชัน
- ✅ **Dashboard UI** - หน้า panel สวยงามแบบ AXER style
- ✅ **Security First** - Helmet, Rate Limiting, Timing-safe Auth

### 🛡️ Security & Performance
- 🔒 **Helmet.js** - Protection headers
- ⚡ **Rate Limiting** - 30 req/min per endpoint
- 🎯 **Request Timeout** - 30s per AI call
- 📊 **Smart Model Matching** - Exact, Partial, Custom
- 🔄 **Auto Model Sync** - อัปเดต model list อัตโนมัติ
- 💾 **Persistent Cache** - แคชผลลัพธ์ตาม timeframe

---

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- MetaTrader 4 or 5
- Git

### 1️⃣ Clone Repository
```bash
git clone https://github.com/lowcode-np/API-EA-AI.git
cd API-EA-AI
```

### 2️⃣ Install Dependencies
```bash
npm install
```

### 3️⃣ Configure Environment
สร้างไฟล์ `.env` หรือตั้งค่าผ่าน hosting platform:

```env
AI_API_KEY=your_secret_key_here
PORT=8000
BASE_URL=https://your-domain.com
```

### 4️⃣ Run Server
```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Server จะรันที่ `http://localhost:8000` 🎉

---

## 🚀 Quick Start

### For MetaTrader Users

1. **Copy Files** ไปยัง MetaTrader directory:
   ```
   📁 MQL/
   ├── AI_Connector.mqh    → Include/
   ├── AI_Models.mqh       → Include/
   ├── Example_EA.mq4      → Experts/
   └── Example_EA.mq5      → Experts/
   ```

2. **Compile EA** ใน MetaEditor (F7)

3. **Enable DLL imports**:
   - Tools → Options → Expert Advisors
   - ✅ Allow DLL imports

4. **Drag EA to Chart** และตั้งค่า:
   - `InpApiUrl`: URL ของ API Server
   - `InpApiKey`: API Key ที่ตั้งไว้
   - `InpModel`: เลือก AI Model

5. **Start Trading!** 🎯

---

## 📚 Documentation

### API Endpoints

#### `GET /health`
Health check endpoint (ไม่ต้อง authentication)

```json
{
  "status": "ok",
  "providers": 47,
  "timestamp": "2026-04-14T12:00:00.000Z"
}
```

#### `GET /models`
ดูรายการ AI models ทั้งหมด

```json
{
  "count": 47,
  "models": [
    { "model": "openai", "provider": "pollinations" },
    { "model": "claude-fast", "provider": "pollinations" },
    { "model": "Qwen/Qwen3.5-27B", "provider": "deepinfra" }
  ]
}
```

#### `POST /analyze`
วิเคราะห์ตลาดด้วย AI (ต้อง API key)

**Request:**
```bash
curl -X POST https://your-api.com/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key" \
  -d '{
    "symbol": "EURUSD",
    "timeframe": "H1",
    "model": "openai",
    "candles": 10
  }'
```

**Response:**
```json
{
  "success": true,
  "ai_analysis": {
    "decision": "BUY",
    "confidence": 75,
    "entry_price": 1.0850,
    "stop_loss": 1.0820,
    "take_profit": 1.0920,
    "reason": "RSI oversold with MACD bullish crossover",
    "risk_level": "MEDIUM",
    "key_levels": {
      "support": 1.0800,
      "resistance": 1.0950
    }
  },
  "used_model": "openai",
  "analyzed_at": "2026-04-14T12:00:05.000Z",
  "cached": false
}
```

### Response Codes

| Code | Description |
|------|-------------|
| 200 | ✅ Success |
| 400 | ❌ Missing required fields |
| 401 | 🔒 Invalid API key |
| 429 | ⏱️ Rate limit exceeded |
| 500 | 💥 All AI providers failed |

---

## 🎨 Dashboard Preview

```
╔═══════════════════════════════════════════════╗
║ 🤖 AI Trading Analysis ──────────── v1.0  [X] ║
╠═══════════════════════════════════════════════╣
║                                               ║
║  📊 SIGNAL                                    ║
║  ▲ BULLISH                                    ║
║  ████████████░░░░  75%                        ║
║                                               ║
║  ┌─ AI ANALYSIS ──────────────────────────┐  ║
║  │ Decision: BUY       Risk: MEDIUM       │  ║
║  │ Model: openai                          │  ║
║  │ [FRESH]  Updated: 14:30                │  ║
║  │ Confidence: 75%                        │  ║
║  └────────────────────────────────────────┘  ║
║                                               ║
║  ┌─ KEY LEVELS ────────────────────────────┐ ║
║  │ Entry: 1.0850      SL: 1.0820          │ ║
║  │ TP: 1.0920                             │ ║
║  └────────────────────────────────────────┘  ║
║                                               ║
║  ┌─ REASON ────────────────────────────────┐ ║
║  │ RSI oversold with MACD bullish         │ ║
║  │ crossover near BB lower band           │ ║
║  └────────────────────────────────────────┘  ║
╚═══════════════════════════════════════════════╝
```

---

## 💡 Usage Example

### Basic Integration

```mql4
#include <AI_Models.mqh>
#include <AI_Connector.mqh>

// Input Parameters
input ENUM_AI_MODEL InpModel  = MODEL_AUTO;
input string InpApiUrl        = "https://axer-ai.onrender.com";
input string InpApiKey        = "";

// Global AI Connector
CAI_Connector g_ai;

//+------------------------------------------------------------------+
//| Expert initialization function                                    |
//+------------------------------------------------------------------+
int OnInit()
{
   // Initialize AI Connector
   g_ai.SetApiUrl(InpApiUrl);
   g_ai.SetApiKey(InpApiKey);
   g_ai.SetTimeout(30000);
   
   Print("AI Trading Analysis initialized ✓");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Analyze current chart
   AI_Result result;
   
   if(g_ai.AnalyzeCurrentChart(InpModel, 10, result))
   {
      if(result.decision == AI_BUY)
      {
         Print("🟢 AI Signal: BUY");
         Print("   Confidence: ", result.confidence, "%");
         Print("   Entry: ", result.entry_price);
         Print("   SL: ", result.stop_loss);
         Print("   TP: ", result.take_profit);
         Print("   Reason: ", result.reason);
         
         // Your trading logic here
         // OrderSend(...);
      }
      else if(result.decision == AI_SELL)
      {
         Print("🔴 AI Signal: SELL");
         // Your trading logic here
      }
      else
      {
         Print("⚪ AI Signal: HOLD");
      }
   }
   else
   {
      Print("❌ AI Analysis failed: ", result.error_message);
   }
}
```

---

## 🔧 Advanced Configuration

### Cache System

Cache TTL ปรับอัตโนมัติตาม timeframe:

| Timeframe | Cache TTL | Use Case |
|-----------|-----------|----------|
| M1 | 45s | Scalping |
| M5 | 2 min | Day Trading |
| M15 | 5 min | Swing |
| M30 | 10 min | Position |
| H1 | 20 min | Daily Analysis |
| H4 | 45 min | Swing Long |
| D1 | 2 hours | Long-term |

**Bypass Cache:**
```mql4
g_ai.SetNoCache(true);  // ข้าม cache ครั้งเดียว
```

### Custom Models

ใช้ model ที่ยังไม่อยู่ใน enum:

```mql4
input ENUM_AI_MODEL InpModel = MODEL_CUSTOM;
input string CustomModelName = "anthropic/claude-3.5";

g_ai.SetCustomModel(CustomModelName);
```

### Model Auto-Update

ตรวจสอบ model list ใหม่:

```bash
# Check for updates
curl https://your-api.com/models/check?hash=current_hash

# Download new AI_Models.mqh
curl -o AI_Models.mqh https://your-api.com/models/mqh
```

---

## 🌐 Deployment

### Deploy to Render

1. Push code to GitHub
2. Create Web Service on [render.com](https://render.com)
3. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     ```
     AI_API_KEY=your_secret_key
     PORT=8000
     BASE_URL=https://your-app.onrender.com
     ```

### Deploy to Railway

```bash
railway login
railway init
railway up
```

### Deploy to Heroku

```bash
heroku create your-app-name
git push heroku main
heroku config:set AI_API_KEY=your_secret_key
```

---

## 📊 Supported AI Models

### Pollinations (26+ models)
`openai` • `openai-fast` • `deepseek` • `gemini-fast` • `claude-fast` • `grok` • `mistral` • `mistral-large` • `nova-fast` • `nova` • `glm` • `minimax` • `qwen-coder` • `qwen-coder-large` • `perplexity-fast`

### DeepInfra (17+ models)
`deepseek-ai/DeepSeek-V3.2` • `Qwen/Qwen3.5-27B` • `Qwen/Qwen3.5-397B-A17B` • `google/gemma-4-26B-A4B-it` • `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B` • `zai-org/GLM-5.1` • `stepfun-ai/Step-3.5-Flash`

> 💡 Model list อัปเดตอัตโนมัติจาก providers

---

## 🤝 Contributing

Contributions are welcome! 🎉

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Pollinations.ai](https://pollinations.ai) - Free AI Models
- [DeepInfra](https://deepinfra.com) - Free AI Infrastructure
- MetaTrader Community

---

## 📞 Support & Contact

- 📧 Email: support@yourproject.com
- 💬 Telegram: [@Iowcode](https://t.me/Iowcode)
- 🐛 Issues: [GitHub Issues](https://github.com/lowcode-np/API-EA-AI/issues)

---

<div align="center">

**Made with ❤️ by [Lowcode](https://t.me/Iowcode)**

⭐ **Star this repo if you find it helpful!** ⭐

</div>