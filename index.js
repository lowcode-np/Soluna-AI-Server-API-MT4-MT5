const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ===== Security Middleware =====
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiter: /analyze — 30 req/min per IP
const analyzeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Try again later.' }
});

// Rate limiter: general — 120 req/min per IP
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests.' }
});
app.use(generalLimiter);

// ===== Configuration =====
const API_KEY = process.env.AI_API_KEY;

// Timing-safe API key check (prevents timing attacks)
function isValidApiKey(input) {
    if (!input || !API_KEY) return false;
    const a = Buffer.from(input);
    const b = Buffer.from(API_KEY);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// AI provider request timeout (ms)
const AI_FETCH_TIMEOUT = 30000;

// ===== Analysis Cache =====
// Cache TTL per timeframe (ms) — แต่ละ timeframe มีอายุ cache ต่างกัน
const CACHE_TTL = {
    'M1':  45 * 1000,       // 45 วินาที
    'M5':  2 * 60 * 1000,   // 2 นาที
    'M15': 5 * 60 * 1000,   // 5 นาที
    'M30': 10 * 60 * 1000,  // 10 นาที
    'H1':  20 * 60 * 1000,  // 20 นาที
    'H4':  45 * 60 * 1000,  // 45 นาที
    'D1':  2 * 60 * 60 * 1000,  // 2 ชั่วโมง
    'W1':  6 * 60 * 60 * 1000,  // 6 ชั่วโมง
    'MN1': 12 * 60 * 60 * 1000, // 12 ชั่วโมง
};
const DEFAULT_CACHE_TTL = 10 * 60 * 1000; // 10 นาที (default)
const MAX_CACHE_SIZE = 500; // จำกัดจำนวน entries ป้องกัน memory leak

// analysisCache: Map<cacheKey, { data, createdAt, expiresAt, hitCount, model }>
const analysisCache = new Map();

// inflightRequests: Map<cacheKey, Promise> — request coalescing
// ถ้ามี request ซ้ำขณะ AI กำลังประมวลผล → รอ promise เดียวกัน ไม่ยิงซ้ำ
const inflightRequests = new Map();

// Cache stats
let cacheStats = { hits: 0, misses: 0, coalesced: 0, evictions: 0 };

function getCacheKey(symbol, timeframe, model) {
    return `${symbol}:${timeframe}:${model || 'auto'}`;
}

function getCacheTTL(timeframe) {
    return CACHE_TTL[timeframe] || DEFAULT_CACHE_TTL;
}

function getCachedResult(key) {
    const entry = analysisCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        analysisCache.delete(key);
        return null;
    }
    entry.hitCount++;
    cacheStats.hits++;
    return entry;
}

function setCachedResult(key, data, timeframe, model) {
    // Evict oldest if cache full
    if (analysisCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = analysisCache.keys().next().value;
        analysisCache.delete(oldestKey);
        cacheStats.evictions++;
    }
    const ttl = getCacheTTL(timeframe);
    analysisCache.set(key, {
        data,
        model,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttl,
        ttl,
        hitCount: 0
    });
}

// Cleanup expired entries ทุก 5 นาที
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of analysisCache) {
        if (now > entry.expiresAt) {
            analysisCache.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) console.log(`  Cache cleanup: removed ${cleaned} expired entries`);
}, 5 * 60 * 1000);

// ===== AI Providers =====
// Hardcoded fallback list (ใช้เมื่อ fetch dynamic ล้มเหลว)
const FALLBACK_PROVIDERS = [
    { url: 'https://text.pollinations.ai/openai', model: 'openai',    name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'deepseek',  name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'gemini',    name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'claude',    name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'grok',      name: 'pollinations' },
    { url: 'https://api.deepinfra.com/v1/openai/chat/completions', model: 'deepseek-ai/DeepSeek-V3.2', name: 'deepinfra' },
    { url: 'https://api.deepinfra.com/v1/openai/chat/completions', model: 'Qwen/Qwen3.5-27B',          name: 'deepinfra' },
];

// Dynamic provider list (populated at startup)
let AI_PROVIDERS = [...FALLBACK_PROVIDERS];

// Model list version tracking
let modelListHash = '';
let modelListUpdatedAt = null;
let modelListVersion = 0;

function computeModelHash() {
    const modelStr = AI_PROVIDERS.map(p => `${p.name}:${p.model}`).sort().join('|');
    return crypto.createHash('md5').update(modelStr).digest('hex');
}

// Audio/image/non-text models to exclude from Pollinations
const POLL_EXCLUDE = new Set(['openai-audio', 'openai-audio-large', 'midijourney', 'midijourney-large', 'qwen-vision', 'qwen-safety', 'polly']);

async function fetchProviders() {
    const providers = [];
    // --- Pollinations ---
    try {
        const resp = await fetch('https://gen.pollinations.ai/text/models');
        if (resp.ok) {
            const models = await resp.json();
            for (const m of models) {
                const name = m.name || m;
                if (POLL_EXCLUDE.has(name)) continue;
                providers.push({ url: 'https://text.pollinations.ai/openai', model: name, name: 'pollinations' });
            }
            console.log(`  Pollinations: ${providers.length} models loaded`);
        }
    } catch (e) { console.log(`  Pollinations fetch failed: ${e.message}`); }

    // --- DeepInfra ---
    const diStart = providers.length;
    try {
        const resp = await fetch('https://api.deepinfra.com/models/featured');
        if (resp.ok) {
            const data = await resp.json();
            for (const m of data) {
                if (m.type !== 'text-generation') continue;
                providers.push({ url: 'https://api.deepinfra.com/v1/openai/chat/completions', model: m.model_name, name: 'deepinfra' });
            }
            console.log(`  DeepInfra: ${providers.length - diStart} models loaded`);
        }
    } catch (e) { console.log(`  DeepInfra fetch failed: ${e.message}`); }

    if (providers.length > 0) {
        AI_PROVIDERS = providers;
    } else {
        console.log('  Using hardcoded fallback providers');
        AI_PROVIDERS = [...FALLBACK_PROVIDERS];
    }
    // Update version tracking
    const newHash = computeModelHash();
    if (newHash !== modelListHash) {
        modelListVersion++;
        modelListHash = newHash;
        modelListUpdatedAt = new Date().toISOString();
        console.log(`  Model list updated: v${modelListVersion} hash=${modelListHash.substring(0, 8)}`);
    }
}

// ===== AI Provider (with auto-fallback) =====

async function askAI(systemPrompt, userPrompt, preferredModel) {
    let providers = [...AI_PROVIDERS];
    if (preferredModel && preferredModel !== 'auto') {
        // Exact match first, then partial match (e.g. "deepseek" matches "deepseek-ai/DeepSeek-V3.2")
        const exact = providers.filter(p => p.model === preferredModel);
        const partial = exact.length === 0
            ? providers.filter(p => p.model.toLowerCase().includes(preferredModel.toLowerCase()))
            : [];
        const preferred = [...exact, ...partial];
        const preferredSet = new Set(preferred);
        const rest = providers.filter(p => !preferredSet.has(p));
        providers = [...preferred, ...rest];
        if (preferred.length > 0) {
            console.log(`  -> Preferred: ${preferredModel} (${preferred.length} match across ${[...new Set(preferred.map(p => p.name))].join('+')})`);
        } else {
            console.log(`  -> Model "${preferredModel}" not in current list, trying anyway via Pollinations`);
            // ถ้า model ไม่อยู่ใน list → inject เป็น Pollinations ลอง (รองรับ model ใหม่)
            providers.unshift({ url: 'https://text.pollinations.ai/openai', model: preferredModel, name: 'pollinations' });
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
                }),
                signal: AbortSignal.timeout(AI_FETCH_TIMEOUT)
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
            const msg = data.choices?.[0]?.message;
            const content = msg?.content || msg?.reasoning_content;
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
    res.json({
        status: 'ok',
        providers: AI_PROVIDERS.length,
        cache: {
            entries: analysisCache.size,
            max: MAX_CACHE_SIZE,
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            coalesced: cacheStats.coalesced,
            evictions: cacheStats.evictions,
            hit_rate: (cacheStats.hits + cacheStats.misses) > 0
                ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1) + '%'
                : '0%'
        },
        timestamp: new Date().toISOString()
    });
});

// ===== List available models =====
app.get('/models', (_req, res) => {
    const models = AI_PROVIDERS.map(p => ({ model: p.model, provider: p.name }));
    res.json({ count: models.length, models });
});

// ===== Force refresh models =====
app.post('/models/refresh', async (req, res) => {
    if (!isValidApiKey(req.headers['x-api-key'])) return res.status(401).json({ success: false, message: "Unauthorized" });
    await fetchProviders();
    res.json({ success: true, count: AI_PROVIDERS.length });
});

// ===== Check model list version (สำหรับผู้พัฒนาตรวจสอบ update) =====
app.get('/models/check', (req, res) => {
    const clientHash = req.query.hash || '';
    const isOutdated = clientHash !== '' && clientHash !== modelListHash;
    const baseUrl = process.env.BASE_URL || 'https://axer-ai.onrender.com';
    res.json({
        version: modelListVersion,
        hash: modelListHash,
        count: AI_PROVIDERS.length,
        updated_at: modelListUpdatedAt,
        outdated: isOutdated,
        download_url: `${baseUrl}/models/mqh`
    });
});

// ===== Generate .mqh include file for EA =====
app.get('/models/mqh', (_req, res) => {
    // สร้างชื่อ enum-safe จาก model name
    function toEnumName(model, provider) {
        const prefix = provider === 'deepinfra' ? 'DI_' : '';
        const name = model
            .replace(/[^a-zA-Z0-9]/g, '_')   // แทนอักษรพิเศษด้วย _
            .replace(/_+/g, '_')              // ลด __ เหลือ _
            .replace(/^_|_$/g, '')            // ตัด _ หัวท้าย
            .toUpperCase();
        return `MODEL_${prefix}${name}`;
    }

    // สร้าง unique enum names
    const seen = new Set(['MODEL_AUTO', 'MODEL_CUSTOM']);
    const entries = [];
    for (const p of AI_PROVIDERS) {
        let eName = toEnumName(p.model, p.name);
        // dedup: ถ้าซ้ำ ให้เติม provider
        if (seen.has(eName)) eName += `_${p.name.toUpperCase()}`;
        if (seen.has(eName)) continue; // skip ถ้ายังซ้ำ
        seen.add(eName);
        entries.push({ enumName: eName, model: p.model, provider: p.name });
    }

    // Build .mqh content
    let mqh = `//+------------------------------------------------------------------+\n`;
    mqh += `//| AI_Models.mqh — Auto-generated from server model list           |\n`;
    mqh += `//| Generated: ${new Date().toISOString()}                          |\n`;
    mqh += `//| Total: ${entries.length} models + Auto + Custom                 |\n`;
    mqh += `//| DO NOT EDIT — will be overwritten by server                     |\n`;
    mqh += `//+------------------------------------------------------------------+\n`;
    mqh += `#ifndef AI_MODELS_MQH\n#define AI_MODELS_MQH\n\n`;

    // ENUM
    mqh += `enum ENUM_AI_MODEL\n{\n`;
    mqh += `   MODEL_AUTO   = 0,  // Auto\n`;
    entries.forEach((e, i) => {
        const comma = (i < entries.length - 1) ? ',' : ',';
        const label = e.provider === 'deepinfra' ? `DI: ${e.model}` : e.model;
        mqh += `   ${e.enumName.padEnd(40)} = ${(i + 1).toString().padStart(3)}, // ${label}\n`;
    });
    mqh += `   MODEL_CUSTOM = 999  // Custom (ระบุใน CustomModelName)\n`;
    mqh += `};\n\n`;

    // ModelToString function
    mqh += `string ModelToString(ENUM_AI_MODEL model)\n{\n`;
    mqh += `   switch(model)\n   {\n`;
    for (const e of entries) {
        mqh += `      case ${e.enumName.padEnd(40)}: return "${e.model}";\n`;
    }
    mqh += `      case MODEL_CUSTOM: return CustomModelName;\n`;
    mqh += `      default: return "auto";\n`;
    mqh += `   }\n}\n\n`;
    mqh += `#endif\n`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="AI_Models.mqh"');
    res.setHeader('X-Model-Hash', modelListHash);
    res.setHeader('X-Model-Version', String(modelListVersion));
    res.send(mqh);
});

// ===== Cache management endpoints =====

// ดูสถานะ cache ทั้งหมด
app.get('/cache', (req, res) => {
    if (!isValidApiKey(req.headers['x-api-key'])) return res.status(401).json({ success: false, message: "Unauthorized" });
    const now = Date.now();
    const entries = [];
    for (const [key, entry] of analysisCache) {
        const remaining = Math.max(0, entry.expiresAt - now);
        entries.push({
            key,
            model: entry.model,
            hits: entry.hitCount,
            created: new Date(entry.createdAt).toISOString(),
            expires_in: Math.round(remaining / 1000) + 's',
            expired: remaining <= 0
        });
    }
    res.json({
        total: analysisCache.size,
        max: MAX_CACHE_SIZE,
        inflight: inflightRequests.size,
        stats: { ...cacheStats },
        entries
    });
});

// ล้าง cache ทั้งหมด หรือเฉพาะ symbol
app.delete('/cache', (req, res) => {
    if (!isValidApiKey(req.headers['x-api-key'])) return res.status(401).json({ success: false, message: "Unauthorized" });
    const symbol = req.query.symbol;
    let cleared = 0;
    if (symbol) {
        for (const key of analysisCache.keys()) {
            if (key.startsWith(symbol + ':')) {
                analysisCache.delete(key);
                cleared++;
            }
        }
    } else {
        cleared = analysisCache.size;
        analysisCache.clear();
    }
    res.json({ success: true, cleared });
});

// ===== Core analysis function (shared by /analyze and cache) =====
async function performAnalysis(d) {
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
Reply JSON:{decision:BUY/SELL/HOLD,confidence:1-100,entry_price,stop_loss,take_profit,reason:"max 180 chars",risk_level:LOW/MEDIUM/HIGH,key_levels:{support,resistance}}`;

    const systemPrompt = "Expert trading analyst. Reply valid JSON only, no markdown. Keep reason under 180 characters.";

    // Sanitize preferred_model
    const preferredModel = (d.preferred_model || 'auto').replace(/[^a-zA-Z0-9\-_.\/]/g, '');

    const result = await askAI(systemPrompt, prompt, preferredModel);

    // Parse JSON from response
    let parsed = null;
    try {
        const text = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
        const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(cleaned);
    } catch (_e) {
        parsed = null;
    }

    return {
        success: true,
        ai_analysis: parsed || result.content,
        used_model: result.model,
        raw: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
        analyzed_at: new Date().toISOString()
    };
}

// ===== Main analyze endpoint (with cache + request coalescing) =====
app.post('/analyze', analyzeLimiter, async (req, res) => {
    if (!isValidApiKey(req.headers['x-api-key'])) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
        const d = req.body;

        // Input validation
        if (!d || !d.symbol || !d.timeframe) {
            return res.status(400).json({ success: false, message: 'Missing required fields: symbol, timeframe' });
        }

        const preferredModel = (d.preferred_model || 'auto').replace(/[^a-zA-Z0-9\-_.\/]/g, '');
        const cacheKey = getCacheKey(d.symbol, d.timeframe, preferredModel);

        // ===== 1) Check cache =====
        // ข้าม cache ถ้า client ส่ง no_cache=true
        if (!d.no_cache) {
            const cached = getCachedResult(cacheKey);
            if (cached) {
                console.log(`  [CACHE HIT] ${cacheKey} (hits: ${cached.hitCount})`);
                const ttlRemaining = Math.round((cached.expiresAt - Date.now()) / 1000);
                return res.json({
                    ...cached.data,
                    cached: true,
                    cache_ttl_remaining: ttlRemaining
                });
            }
        }

        // ===== 2) Request coalescing — ถ้ามี request เดียวกันกำลังรอ AI อยู่ ให้รอ promise เดียวกัน =====
        if (inflightRequests.has(cacheKey)) {
            console.log(`  [COALESCED] ${cacheKey} — waiting for inflight request`);
            cacheStats.coalesced++;
            try {
                const data = await inflightRequests.get(cacheKey);
                return res.json({ ...data, cached: true, coalesced: true });
            } catch (error) {
                // inflight failed — ตกลงไป create ใหม่ข้างล่าง
            }
        }

        // ===== 3) Fresh AI call =====
        cacheStats.misses++;
        console.log(`  [CACHE MISS] ${cacheKey} — calling AI...`);

        // สร้าง promise แล้วเก็บใน inflight map
        const analysisPromise = performAnalysis(d);
        inflightRequests.set(cacheKey, analysisPromise);

        try {
            const data = await analysisPromise;

            // บันทึก cache (เฉพาะ success + parse ได้)
            if (data.success && data.ai_analysis && typeof data.ai_analysis === 'object') {
                setCachedResult(cacheKey, data, d.timeframe, data.used_model);
                console.log(`  [CACHED] ${cacheKey} — TTL ${getCacheTTL(d.timeframe) / 1000}s`);
            }

            res.json({ ...data, cached: false });
        } finally {
            inflightRequests.delete(cacheKey);
        }

    } catch (error) {
        console.error("Analysis error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT;
app.listen(PORT, async () => {
    console.log(`SolunaAI Trading API running on port ${PORT}`);
    console.log('Fetching model lists...');
    await fetchProviders();
    const pollCount = AI_PROVIDERS.filter(p => p.name === 'pollinations').length;
    const diCount = AI_PROVIDERS.filter(p => p.name === 'deepinfra').length;
    console.log(`AI Providers: ${AI_PROVIDERS.length} total (Pollinations: ${pollCount}, DeepInfra: ${diCount})`);

    // Auto-refresh model list ทุก 6 ชั่วโมง
    setInterval(async () => {
        console.log('Auto-refreshing model lists...');
        await fetchProviders();
        console.log(`Refreshed: ${AI_PROVIDERS.length} providers`);
    }, 24 * 60 * 60 * 1000);
});

module.exports = app;