/*
 * Project: AI Trading Analysis for MetaTrader
 * Author: Lowcode (https://t.me/Iowcode)
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
 *
 * Commercial use of this software is strictly prohibited.
 * If you remix, transform, or build upon the material, you must distribute
 * your contributions under the same license as the original.
 */

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

// Rate limiter: /analyze — 60 req/min per IP (รองรับ EA หลายตัว)
const analyzeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
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

// ===== Concurrency Limiter =====
// จำกัดจำนวน AI calls ที่ยิงพร้อมกัน ป้องกัน provider โดน flood
const MAX_CONCURRENT_AI_CALLS = 1;
let activeAICalls = 0;
const aiCallQueue = [];

function acquireAISlot() {
    return new Promise(resolve => {
        if (activeAICalls < MAX_CONCURRENT_AI_CALLS) {
            activeAICalls++;
            resolve();
        } else {
            aiCallQueue.push(resolve);
        }
    });
}

function releaseAISlot() {
    activeAICalls--;
    if (aiCallQueue.length > 0) {
        activeAICalls++;
        const next = aiCallQueue.shift();
        next();
    }
}

// ===== Global Provider Cooldown =====
// เมื่อ provider โดน 429 → cooldown ทั้ง server ไม่ใช่แค่ request เดียว
const providerCooldown = new Map(); // provider name → cooldown until timestamp
const COOLDOWN_MS = 60 * 1000; // 1 นาที

function isProviderCoolingDown(providerName) {
    const until = providerCooldown.get(providerName);
    if (!until) return false;
    if (Date.now() >= until) {
        providerCooldown.delete(providerName);
        return false;
    }
    return true;
}

function setProviderCooldown(providerName) {
    providerCooldown.set(providerName, Date.now() + COOLDOWN_MS);
    console.log(`  [COOLDOWN] ${providerName} cooled down for ${COOLDOWN_MS / 1000}s`);
}

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

function getCacheKey(symbol, timeframe, model, utcSlot) {
    return `${symbol}:${timeframe}:${model || 'auto'}:${utcSlot || ''}`;
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

// Timeframe → milliseconds
const TF_MS = {
    'M1': 60000, 'M5': 300000, 'M15': 900000, 'M30': 1800000,
    'H1': 3600000, 'H4': 14400000, 'D1': 86400000, 'W1': 604800000, 'MN1': 2592000000
};

// Compute UTC candle slot from broker server_time + gmt_offset + timeframe
// Returns ISO-like string floored to the timeframe boundary, e.g. "2026-04-17T06" for H1
function getUtcCandleSlot(serverTime, gmtOffsetSec, timeframe) {
    if (!serverTime) return '';
    // Parse broker server_time (format: "2026.04.17 15:00" or "2026-04-17 15:00")
    const normalized = serverTime.replace(/\./g, '-');
    const brokerMs = new Date(normalized).getTime();
    if (isNaN(brokerMs)) return '';
    // Convert to UTC
    const utcMs = brokerMs - (gmtOffsetSec || 0) * 1000;
    // Floor to timeframe boundary
    const tfMs = TF_MS[timeframe] || TF_MS['H1'];
    const slotMs = Math.floor(utcMs / tfMs) * tfMs;
    const d = new Date(slotMs);
    // Compact ISO format (no seconds) for cache key
    return d.toISOString().replace(/:\d{2}\.\d{3}Z$/, '');
}

// ===== AI Providers =====
// Hardcoded fallback list (ใช้เมื่อ fetch dynamic ล้มเหลว)
const FALLBACK_PROVIDERS = [
    { url: 'https://text.pollinations.ai/openai', model: 'openai',       name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'openai-fast',  name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'deepseek',     name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'gemini-fast',  name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'claude-fast',  name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'grok',         name: 'pollinations' },
    { url: 'https://text.pollinations.ai/openai', model: 'mistral',      name: 'pollinations' },
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

// Models to exclude — audio/image/specialized + heavy reasoning (slow, timeout, rate-limited)
const POLL_EXCLUDE = new Set([
    'openai-audio', 'openai-audio-large',        // Audio models
    'midijourney', 'midijourney-large',          // Music models
    'qwen-vision', 'qwen-safety',                // Vision/Safety models
    'polly',                                     // Pollinations assistant
    // Heavy reasoning models (slow, expensive, prone to timeout/rate-limit)
    'openai-large',                              // GPT-5.4 reasoning
    'grok-large',                                // Grok reasoning
    'perplexity-reasoning',                      // Reasoning + search
    'kimi',                                      // Heavy CoT reasoning
    'qwen-large',                                // 396B MoE — very heavy
    'gemini-search',                             // Search-oriented, not for trading
]);

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
                if (m.paid_only) continue;       // paid-only models get rate-limited on free tier
                if (m.is_specialized) continue;   // specialized models (music, safety, etc.)
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
                if (m.tags && m.tags.includes('no-free-anon')) continue; // requires paid account
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

const MAX_FALLBACK_ATTEMPTS = 5; // จำกัดจำนวน model ที่ลอง fallback

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
            console.log(`  -> Preferred: ${preferredModel} (${preferred.length} match across ${[...new Set(preferred.map(p => p.name))].join('+')})`)
        } else {
            console.log(`  -> Model "${preferredModel}" not in current list, trying anyway via Pollinations`);
            providers.unshift({ url: 'https://text.pollinations.ai/openai', model: preferredModel, name: 'pollinations' });
        }
    }
    // จำกัด fallback ไม่ให้ลองเกิน MAX_FALLBACK_ATTEMPTS ตัว
    // กรอง provider ที่อยู่ใน cooldown ออก (โดน 429 จาก request อื่น)
    providers = providers
        .filter(p => !isProviderCoolingDown(p.name))
        .slice(0, MAX_FALLBACK_ATTEMPTS);

    if (providers.length === 0) {
        throw new Error('All providers are in cooldown. Try again in 1 minute.');
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
                if (resp.status === 429) {
                    console.log(`  -> Rate limited (429) on ${provider.name} - global cooldown`);
                    setProviderCooldown(provider.name); // cooldown ทั้ง server
                    errors.push(`${provider.model}: Rate limited`);
                    continue; // ลอง provider อื่นต่อ
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
        concurrency: {
            active_ai_calls: activeAICalls,
            max_concurrent: MAX_CONCURRENT_AI_CALLS,
            queued: aiCallQueue.length,
            cooldowns: Object.fromEntries(
                [...providerCooldown.entries()].map(([k, v]) => [k, Math.round((v - Date.now()) / 1000) + 's'])
            )
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
    mqh += `//| Project: AI Trading Analysis for MetaTrader                      |\n`;
    mqh += `//| Author:  Lowcode (https://t.me/Iowcode)                         |\n`;
    mqh += `//| License: CC BY-NC-SA 4.0                                        |\n`;
    mqh += `//|                                                                  |\n`;
    mqh += `//| Commercial use of this software is strictly prohibited.          |\n`;
    mqh += `//| If you remix, transform, or build upon the material, you must    |\n`;
    mqh += `//| distribute your contributions under the same license.            |\n`;
    mqh += `//+------------------------------------------------------------------+\n`;
    mqh += `//| AI_Models.mqh — Auto-generated from server model list            |\n`;
    mqh += `//| Generated: ${new Date().toISOString()}                           |\n`;
    mqh += `//| Total: ${entries.length} models + Auto + Custom                  |\n`;
    mqh += `//| DO NOT EDIT — will be overwritten by server                      |\n`;
    mqh += `//+------------------------------------------------------------------+\n`;
    mqh += `#ifndef AI_MODELS_MQH\n#define AI_MODELS_MQH\n\n`;

    // ENUM
    mqh += `enum ENUM_AI_MODEL\n{\n`;
    mqh += `   MODEL_AUTO   = 0,  // Auto\n`;
    entries.forEach((e, i) => {
        const label = e.provider === 'deepinfra' ? `DI: ${e.model}` : e.model;
        mqh += `   ${e.enumName.padEnd(40)} = ${(i + 1).toString().padStart(3)}, // ${label}\n`;
    });
    mqh += `   MODEL_CUSTOM = 999  // Custom\n`;
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

    const systemPrompt = `You are a professional trading analyst. Analyze the provided market data and return a JSON trading decision.

DECISION RULES (STRICTLY FOLLOW):
- BUY: At least 3 indicators align bullish (RSI<35 rising, MACD histogram positive/crossing up, price above MA20, Stoch K crossing above D from oversold, price near BB lower). Entry_price MUST equal the current Ask price.
- SELL: At least 3 indicators align bearish (RSI>65 falling, MACD histogram negative/crossing down, price below MA20, Stoch K crossing below D from overbought, price near BB upper). Entry_price MUST equal the current Bid price.
- HOLD: When indicators conflict, RSI is 40-60, no clear setup, MACD flat, or price is mid-range in BB. HOLD is the DEFAULT — only signal BUY/SELL when evidence is strong.

PRICING RULES:
- entry_price: MUST be current Ask (for BUY) or current Bid (for SELL), or 0 for HOLD.
- stop_loss: Place beyond ATR*1.5 from entry. For BUY: entry - ATR*1.5. For SELL: entry + ATR*1.5. Must be > 0 for BUY/SELL, 0 for HOLD.
- take_profit: Minimum 1.5:1 reward:risk ratio from entry. Must be > 0 for BUY/SELL, 0 for HOLD.
- support: Nearest support level from recent low, BB lower, or MA levels.
- resistance: Nearest resistance level from recent high, BB upper, or MA levels.

CONFIDENCE RULES:
- 1-30: Weak signal, should likely be HOLD
- 31-60: Moderate signal
- 61-100: Strong signal with multiple confirmations
- If confidence < 30, decision MUST be HOLD.

OUTPUT: Reply with valid JSON only. No markdown, no explanation outside JSON. Keep reason under 180 characters.
{"decision":"BUY|SELL|HOLD","confidence":1-100,"entry_price":number,"stop_loss":number,"take_profit":number,"reason":"string","risk_level":"LOW|MEDIUM|HIGH","key_levels":{"support":number,"resistance":number}}`;

    const prompt = `[MARKET DATA] ${d.symbol} ${d.timeframe} at ${d.server_time}
Bid:${d.bid} Ask:${d.ask} Spread:${d.spread}
DayOpen:${d.day_open} DayChange:${d.day_change} (${d.day_change_pct}%)

[TREND] ${d.trend}
MA20:${d.ma20} MA50:${d.ma50} MA200:${d.ma200}

[INDICATORS]
RSI(14):${d.rsi}
MACD:${d.macd_main} Signal:${d.macd_signal} Hist:${d.macd_histogram}
Stoch K:${d.stoch_k} D:${d.stoch_d}
ATR(14):${d.atr}
BB Upper:${d.bb_upper} Middle:${d.bb_middle} Lower:${d.bb_lower}

[KEY LEVELS] RecentHigh:${d.recent_high} RecentLow:${d.recent_low}

[ACCOUNT] Balance:${d.account_balance} Equity:${d.account_equity} FreeMargin:${d.free_margin}

[POSITIONS] ${positions}

[CANDLES] ${candles}`;

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

    // ===== Server-side validation: force HOLD on invalid AI responses =====
    if (parsed && typeof parsed === 'object') {
        const decision = (parsed.decision || '').toUpperCase();
        const entryPrice = Number(parsed.entry_price) || 0;
        const sl = Number(parsed.stop_loss) || 0;
        const tp = Number(parsed.take_profit) || 0;
        const confidence = Number(parsed.confidence) || 0;
        const bid = Number(d.bid) || 0;
        const ask = Number(d.ask) || 0;

        let forceHold = false;
        let holdReason = '';

        if ((decision === 'BUY' || decision === 'SELL') && entryPrice <= 0) {
            forceHold = true;
            holdReason = `Forced HOLD: AI said ${decision} but entry_price=0`;
        } else if ((decision === 'BUY' || decision === 'SELL') && (sl <= 0 || tp <= 0)) {
            forceHold = true;
            holdReason = `Forced HOLD: AI said ${decision} but SL=${sl} TP=${tp} invalid`;
        } else if (confidence < 30 && (decision === 'BUY' || decision === 'SELL')) {
            forceHold = true;
            holdReason = `Forced HOLD: confidence ${confidence}% too low for ${decision}`;
        } else if (decision === 'BUY' && ask > 0 && Math.abs(entryPrice - ask) > ask * 0.01) {
            forceHold = true;
            holdReason = `Forced HOLD: BUY entry ${entryPrice} too far from Ask ${ask}`;
        } else if (decision === 'SELL' && bid > 0 && Math.abs(entryPrice - bid) > bid * 0.01) {
            forceHold = true;
            holdReason = `Forced HOLD: SELL entry ${entryPrice} too far from Bid ${bid}`;
        }

        if (forceHold) {
            console.log(`  [VALIDATION] ${holdReason}`);
            parsed.original_decision = parsed.decision;
            parsed.original_confidence = parsed.confidence;
            parsed.decision = 'HOLD';
            parsed.confidence = Math.min(confidence, 25);
            parsed.entry_price = 0;
            parsed.stop_loss = 0;
            parsed.take_profit = 0;
            parsed.reason = holdReason.substring(0, 180);
            parsed.risk_level = 'LOW';
        }
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
        // Normalize candle time to UTC slot — ทุก Broker ที่อยู่ช่วงเวลาเดียวกันจะได้ cache key เดียวกัน
        const utcSlot = getUtcCandleSlot(d.server_time, d.gmt_offset, d.timeframe);
        const cacheKey = getCacheKey(d.symbol, d.timeframe, preferredModel, utcSlot);

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
        // acquireAISlot() จะรอจนกว่าจะมี slot ว่าง (ป้องกัน provider flood)
        await acquireAISlot();
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
            releaseAISlot();
        }

    } catch (error) {
        console.error("Analysis error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
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
    }, 6 * 60 * 60 * 1000);
});

// Graceful shutdown — ปิด server อย่างเรียบร้อยเมื่อ deploy ใหม่
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
    // Force close after 10s
    setTimeout(() => process.exit(1), 10000);
});

module.exports = app;