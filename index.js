const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ===== Configuration =====
const API_KEY = process.env.AI_API_KEY;

// ===== AI Providers (direct APIs, no g4f proxy) =====
const AI_PROVIDERS = [
    { url: 'https://text.pollinations.ai/openai', model: 'openai',       name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'openai-large', name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'deepseek',     name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'mistral',      name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'gemini-fast',  name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'claude-fast',  name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'grok',         name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'kimi',         name: 'pollinations' },
];

// ===== AI Provider (with auto-fallback) =====

async function askAI(systemPrompt, userPrompt, preferredModel) {
    // จัดลำดับ provider: ถ้ามี preferred model ให้ลองตัวนั้นก่อน
    let providers = [...AI_PROVIDERS];
    if (preferredModel && preferredModel !== 'auto') {
        const preferred = providers.filter(p => p.model === preferredModel || p.model.includes(preferredModel));
        const rest = providers.filter(p => p.model !== preferredModel && !p.model.includes(preferredModel));
        providers = [...preferred, ...rest];
        if (preferred.length > 0) {
            console.log(`  -> Preferred model: ${preferredModel} (matched ${preferred.length} provider${preferred.length > 1 ? 's' : ''})`);
        } else {
            console.log(`  -> Preferred model "${preferredModel}" not found, using default order`);
        }
    }
    const errors = [];
    for (const provider of providers) {
        try {
            const resp = await fetch(provider.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: provider.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ]
                })
            });
            if (!resp.ok) {
                const errText = await resp.text();
                // หยุด fallback ทันทีเมื่อเจอ rate limit (429)
                if (resp.status === 429) {
                    console.log(`  -> Rate limited (429) - stopping fallback`);
                    throw new Error(`Rate limited. Try again in 1 minute.`);
                }
                throw new Error(`HTTP ${resp.status}: ${errText.substring(0, 100)}`);
            }
            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) throw new Error('Empty response');
            console.log(`  -> Success: ${provider.name}/${provider.model}`);
            return { content, model: provider.model, endpoint: provider.name };
        } catch (e) {
            console.log(`  -> Failed: ${provider.name}/${provider.model} - ${e.message.substring(0, 60)}`);
            errors.push(`${provider.model}: ${e.message}`);
            // หยุดทันทีถ้า rate limit — ลองต่อไปก็โดนเหมือนกัน
            if (e.message.includes('Rate limited')) break;
        }
    }
    throw new Error(`All providers failed:\n${errors.join('\n')}`);
}

// ===== Health check =====
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== Main analyze endpoint =====
app.post('/analyze', async (req, res) => {
    const userApiKey = req.headers['x-api-key'];
    if (userApiKey !== API_KEY) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
        const d = req.body;

        // ===== สร้าง prompt แบบประหยัด token =====
        const candles = (d.candles || []).map((c, i) =>
            `${i}:${c.t}|${c.o}/${c.h}/${c.l}/${c.c}|v${c.v}`
        ).join('; ');

        const positions = (d.positions || []).length > 0
            ? (d.positions || []).map(p =>
                `#${p.ticket} ${p.type} ${p.lots}L@${p.open_price} SL${p.sl} TP${p.tp} PnL${p.profit}`
            ).join('; ')
            : 'none';

        const prompt = `Analyze ${d.symbol} ${d.timeframe} at ${d.server_time}:
Price:${d.bid}/${d.ask} Spd:${d.spread} DayOpen:${d.day_open} Chg:${d.day_change}(${d.day_change_pct}%)
Trend:${d.trend} MA:20=${d.ma20},50=${d.ma50},200=${d.ma200}
RSI:${d.rsi} MACD:${d.macd_main}/${d.macd_signal}/${d.macd_histogram} Stoch:${d.stoch_k}/${d.stoch_d}
ATR:${d.atr} BB:${d.bb_upper}/${d.bb_middle}/${d.bb_lower}
S/R:H${d.recent_high} L${d.recent_low}
Acct:Bal${d.account_balance} Eq${d.account_equity} FM${d.free_margin}
Pos:${positions}
Candles(O/H/L/C):${candles}
Reply JSON:{decision:BUY/SELL/HOLD,confidence:1-100,entry_price,stop_loss,take_profit,reason:"short",risk_level:LOW/MEDIUM/HIGH,key_levels:{support,resistance}}`;

        const systemPrompt = "Expert trading analyst. Reply valid JSON only, no markdown.";

        const result = await askAI(systemPrompt, prompt, d.preferred_model);

        // พยายาม parse JSON จาก response
        let parsed = null;
        try {
            // ลอง parse ตรงๆ ก่อน
            const text = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
            // ตัด markdown code block ถ้ามี
            const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            parsed = JSON.parse(cleaned);
        } catch (_e) {
            // ถ้า parse ไม่ได้ ส่ง raw text กลับ
            parsed = null;
        }

        res.json({
            success: true,
            ai_analysis: parsed || result.content,
            used_model: `${result.endpoint}/${result.model}`,
            raw: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
            analyzed_at: new Date().toISOString()
        });

    } catch (error) {
        console.error("Analysis error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`SolunaAI Trading API running on port ${PORT}`);
    console.log(`Pollinations direct: ${AI_PROVIDERS.length} providers`);
});

module.exports = app;