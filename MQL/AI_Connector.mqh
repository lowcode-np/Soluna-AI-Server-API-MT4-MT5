//+------------------------------------------------------------------+
//| Project: AI Trading Analysis for MetaTrader                      |
//| Author:  Lowcode (https://t.me/Iowcode)                         |
//| License: CC BY-NC-SA 4.0                                        |
//|                                                                  |
//| Commercial use of this software is strictly prohibited.          |
//| If you remix, transform, or build upon the material, you must    |
//| distribute your contributions under the same license.            |
//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| AI_Connector.mqh â€” AI Trading Analysis Connector                 |
//| WinInet.dll-based HTTP connection to AI API Server               |
//+------------------------------------------------------------------+
#ifndef AI_CONNECTOR_MQH
#define AI_CONNECTOR_MQH

//+------------------------------------------------------------------+
//| MQL4/MQL5 Compatibility Layer                                    |
//+------------------------------------------------------------------+
#ifdef __MQL4__
   #define COMPAT_MQL4
#else
   #define COMPAT_MQL5
#endif

//+------------------------------------------------------------------+
//| WinInet.dll Imports                                              |
//+------------------------------------------------------------------+
#import "Wininet.dll"
int InternetOpenW(string,int,string,string,int);
int InternetConnectW(int,string,int,string,string,int,int,int);
int HttpOpenRequestW(int,string,string,string,string,int,int,int);
int HttpSendRequestW(int,string,int,uchar &arr[],int);
int InternetOpenUrlW(int,string,string,int,int,int);
int InternetReadFile(int,uchar &arr[],int,int &OneInt[]);
int InternetCloseHandle(int);
bool InternetSetOptionW(int,int,int &buf[],int);
#import

//+------------------------------------------------------------------+
//| Enums                                                            |
//+------------------------------------------------------------------+
enum ENUM_AI_DECISION  { AI_BUY = 1, AI_SELL = -1, AI_HOLD = 0, AI_ERROR = -99 };
enum ENUM_AI_RISK      { RISK_LOW = 0, RISK_MEDIUM = 1, RISK_HIGH = 2, RISK_UNKNOWN = -1 };

//+------------------------------------------------------------------+
//| Structs                                                          |
//+------------------------------------------------------------------+
struct AI_Result
{
   bool              success;
   ENUM_AI_DECISION  decision;
   int               confidence;       // 1-100
   double            entry_price;
   double            stop_loss;
   double            take_profit;
   string            reason;
   ENUM_AI_RISK      risk_level;
   double            support;
   double            resistance;
   string            used_model;
   string            analyzed_at;
   string            raw_response;
   string            error_message;
   bool              from_cache;
   bool              coalesced;
   int               cache_ttl_remaining;

   void Reset()
   {
      success       = false;
      decision      = AI_HOLD;
      confidence    = 0;
      entry_price   = 0;
      stop_loss     = 0;
      take_profit   = 0;
      reason        = "";
      risk_level    = RISK_UNKNOWN;
      support       = 0;
      resistance    = 0;
      used_model    = "";
      analyzed_at   = "";
      raw_response  = "";
      error_message = "";
      from_cache    = false;
      coalesced     = false;
      cache_ttl_remaining = 0;
   }
};

struct AI_Candle
{
   string time;
   double open;
   double high;
   double low;
   double close;
   long   volume;
};

struct AI_Position
{
   long   ticket;
   string type;
   double lots;
   double open_price;
   double sl;
   double tp;
   double profit;
   double swap;
};

//+------------------------------------------------------------------+
//| CAI_Connector Class                                              |
//+------------------------------------------------------------------+
class CAI_Connector
{
private:
   string            m_api_url;
   string            m_api_key;
   int               m_timeout;
   string            m_custom_model;
   bool              m_no_cache;
   int               m_gmt_offset;

   // --- JSON helpers ---
   string            JsonEscape(const string text);
   string            Dbl(double value, int digits);
   string            BuildCandleJson(const AI_Candle &candle);
   string            BuildPositionJson(const AI_Position &pos);
   string            BuildRequestBody(const string symbol, const string timeframe,
                                      const string model_name,
                                      double bid, double ask, double spread, int digits,
                                      double day_open, double day_change, double day_change_pct,
                                      double rsi, double macd_main, double macd_signal, double macd_hist,
                                      double atr, double bb_upper, double bb_middle, double bb_lower,
                                      double stoch_k, double stoch_d,
                                      double ma20, double ma50, double ma200,
                                      const string trend,
                                      double recent_high, double recent_low,
                                      double balance, double equity, double free_margin,
                                      const string server_time,
                                      const AI_Candle &candles[], int candle_count,
                                      const AI_Position &positions[], int pos_count);

   // --- Response parsing ---
   string            JsonGetString(const string json, const string key);
   double            JsonGetDouble(const string json, const string key);
   int               JsonGetInt(const string json, const string key);
   string            JsonGetObject(const string json, const string key);
   ENUM_AI_DECISION  ParseDecision(const string value);
   ENUM_AI_RISK      ParseRisk(const string value);

   // --- HTTP ---
   bool              HttpPost(const string url, const string headers_str, const string body,
                              string &response, int &http_code);
   void              ParseUrl(const string url, string &host, int &port, string &path, bool &useSSL);

public:
                     CAI_Connector();
                    ~CAI_Connector() {}

   // --- Configuration ---
   void              SetApiUrl(const string url)          { m_api_url = url; }
   void              SetApiKey(const string key)          { m_api_key = key; }
   void              SetTimeout(int ms)                   { m_timeout = ms; }
   void              SetCustomModel(const string name)    { m_custom_model = name; }
   void              SetNoCache(bool val)                 { m_no_cache = val; }
   void              SetGmtOffset(int seconds)            { m_gmt_offset = seconds; }
   string            GetApiUrl() const                    { return m_api_url; }
   bool              GetNoCache() const                   { return m_no_cache; }
   int               GetGmtOffset() const                 { return m_gmt_offset; }

   // --- Health check ---
   bool              CheckHealth(int &provider_count);

   // --- Full analysis (à¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹€à¸­à¸‡) ---
   bool              Analyze(ENUM_AI_MODEL model,
                             const string symbol, const string timeframe,
                             double bid, double ask, double spread, int digits,
                             double day_open, double day_change, double day_change_pct,
                             double rsi, double macd_main, double macd_signal, double macd_hist,
                             double atr, double bb_upper, double bb_middle, double bb_lower,
                             double stoch_k, double stoch_d,
                             double ma20, double ma50, double ma200,
                             const string trend,
                             double recent_high, double recent_low,
                             double balance, double equity, double free_margin,
                             const string server_time,
                             const AI_Candle &candles[], int candle_count,
                             const AI_Position &positions[], int pos_count,
                             AI_Result &result);

   // --- Quick analysis (à¹€à¸à¹‡à¸šà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ˆà¸²à¸à¸Šà¸²à¸£à¹Œà¸•à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´) ---
   #ifdef COMPAT_MQL5
   bool              AnalyzeCurrentChart(ENUM_AI_MODEL model, int candle_count, AI_Result &result);
   #endif
   #ifdef COMPAT_MQL4
   bool              AnalyzeCurrentChart(ENUM_AI_MODEL model, int candle_count, AI_Result &result);
   #endif
};

//+------------------------------------------------------------------+
//| Constructor                                                      |
//+------------------------------------------------------------------+
CAI_Connector::CAI_Connector()
{
   m_api_url      = "";
   m_api_key      = "";
   m_timeout      = 30000;
   m_custom_model = "";
   m_no_cache     = false;
   m_gmt_offset   = 0;
}

//+------------------------------------------------------------------+
//| JSON helpers                                                     |
//+------------------------------------------------------------------+
string CAI_Connector::JsonEscape(const string text)
{
   string out = text;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\n", "\\n");
   StringReplace(out, "\r", "\\r");
   StringReplace(out, "\t", "\\t");
   return out;
}

string CAI_Connector::Dbl(double value, int digits)
{
   return DoubleToString(value, digits);
}

string CAI_Connector::BuildCandleJson(const AI_Candle &candle)
{
   return StringFormat("{\"t\":\"%s\",\"o\":%s,\"h\":%s,\"l\":%s,\"c\":%s,\"v\":%d}",
                       candle.time,
                       Dbl(candle.open, 5), Dbl(candle.high, 5),
                       Dbl(candle.low, 5), Dbl(candle.close, 5),
                       candle.volume);
}

string CAI_Connector::BuildPositionJson(const AI_Position &pos)
{
   return StringFormat("{\"ticket\":%d,\"type\":\"%s\",\"lots\":%s,\"open_price\":%s,\"sl\":%s,\"tp\":%s,\"profit\":%s,\"swap\":%s}",
                       pos.ticket, pos.type,
                       Dbl(pos.lots, 2), Dbl(pos.open_price, 5),
                       Dbl(pos.sl, 5), Dbl(pos.tp, 5),
                       Dbl(pos.profit, 2), Dbl(pos.swap, 2));
}

//+------------------------------------------------------------------+
//| Build full request body                                          |
//+------------------------------------------------------------------+
string CAI_Connector::BuildRequestBody(const string symbol, const string timeframe,
                                       const string model_name,
                                       double bid, double ask, double spread, int digits,
                                       double day_open, double day_change, double day_change_pct,
                                       double rsi, double macd_main, double macd_signal, double macd_hist,
                                       double atr, double bb_upper, double bb_middle, double bb_lower,
                                       double stoch_k, double stoch_d,
                                       double ma20, double ma50, double ma200,
                                       const string trend,
                                       double recent_high, double recent_low,
                                       double balance, double equity, double free_margin,
                                       const string server_time,
                                       const AI_Candle &candles[], int candle_count,
                                       const AI_Position &positions[], int pos_count)
{
   int d = digits;

   string cj = "";
   for(int i = 0; i < candle_count; i++)
   { if(i > 0) cj += ","; cj += BuildCandleJson(candles[i]); }

   string pj = "";
   for(int i = 0; i < pos_count; i++)
   { if(i > 0) pj += ","; pj += BuildPositionJson(positions[i]); }

   string b = "{";
   b += "\"preferred_model\":\"" + JsonEscape(model_name) + "\",";
   b += "\"symbol\":\"" + JsonEscape(symbol) + "\",";
   b += "\"timeframe\":\"" + JsonEscape(timeframe) + "\",";
   b += "\"bid\":" + Dbl(bid, d) + ",\"ask\":" + Dbl(ask, d) + ",";
   b += "\"spread\":" + Dbl(spread, d) + ",\"digits\":" + IntegerToString(digits) + ",";
   b += "\"day_open\":" + Dbl(day_open, d) + ",";
   b += "\"day_change\":" + Dbl(day_change, d) + ",";
   b += "\"day_change_pct\":" + Dbl(day_change_pct, 2) + ",";
   b += "\"rsi\":" + Dbl(rsi, 2) + ",";
   b += "\"macd_main\":" + Dbl(macd_main, 6) + ",";
   b += "\"macd_signal\":" + Dbl(macd_signal, 6) + ",";
   b += "\"macd_histogram\":" + Dbl(macd_hist, 6) + ",";
   b += "\"atr\":" + Dbl(atr, d) + ",";
   b += "\"bb_upper\":" + Dbl(bb_upper, d) + ",";
   b += "\"bb_middle\":" + Dbl(bb_middle, d) + ",";
   b += "\"bb_lower\":" + Dbl(bb_lower, d) + ",";
   b += "\"stoch_k\":" + Dbl(stoch_k, 2) + ",\"stoch_d\":" + Dbl(stoch_d, 2) + ",";
   b += "\"ma20\":" + Dbl(ma20, d) + ",\"ma50\":" + Dbl(ma50, d) + ",\"ma200\":" + Dbl(ma200, d) + ",";
   b += "\"trend\":\"" + JsonEscape(trend) + "\",";
   b += "\"recent_high\":" + Dbl(recent_high, d) + ",";
   b += "\"recent_low\":" + Dbl(recent_low, d) + ",";
   b += "\"account_balance\":" + Dbl(balance, 2) + ",";
   b += "\"account_equity\":" + Dbl(equity, 2) + ",";
   b += "\"free_margin\":" + Dbl(free_margin, 2) + ",";
   b += "\"server_time\":\"" + JsonEscape(server_time) + "\",";
   b += "\"gmt_offset\":" + IntegerToString(m_gmt_offset) + ",";
   b += "\"candles\":[" + cj + "],";
   b += "\"positions\":[" + pj + "]";
   if(m_no_cache) b += ",\"no_cache\":true";
   b += "}";
   return b;
}

//+------------------------------------------------------------------+
//| JSON Parsers                                                     |
//+------------------------------------------------------------------+
string CAI_Connector::JsonGetString(const string json, const string key)
{
   string search = "\"" + key + "\"";
   int pos = StringFind(json, search);
   if(pos < 0) return "";
   int colon = StringFind(json, ":", pos + StringLen(search));
   if(colon < 0) return "";
   int start = StringFind(json, "\"", colon + 1);
   if(start < 0) return "";
   start++;
   string result = "";
   for(int i = start; i < StringLen(json); i++)
   {
      ushort ch = StringGetCharacter(json, i);
      if(ch == '\\' && i + 1 < StringLen(json))
      {
         ushort next = StringGetCharacter(json, i + 1);
         if(next == '"')  { result += "\""; i++; continue; }
         if(next == 'n')  { result += "\n"; i++; continue; }
         if(next == '\\') { result += "\\"; i++; continue; }
         result += "\\"; continue;
      }
      if(ch == '"') break;
      result += ShortToString(ch);
   }
   return result;
}

double CAI_Connector::JsonGetDouble(const string json, const string key)
{
   string search = "\"" + key + "\"";
   int pos = StringFind(json, search);
   if(pos < 0) return 0;
   int colon = StringFind(json, ":", pos + StringLen(search));
   if(colon < 0) return 0;
   string num = "";
   for(int i = colon + 1; i < StringLen(json); i++)
   {
      ushort ch = StringGetCharacter(json, i);
      if(ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r') continue;
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == '+' || ch == 'e' || ch == 'E')
         num += ShortToString(ch);
      else break;
   }
   if(num == "") return 0;
   return StringToDouble(num);
}

int CAI_Connector::JsonGetInt(const string json, const string key)
{
   return (int)JsonGetDouble(json, key);
}

string CAI_Connector::JsonGetObject(const string json, const string key)
{
   string search = "\"" + key + "\"";
   int pos = StringFind(json, search);
   if(pos < 0) return "";
   int colon = StringFind(json, ":", pos + StringLen(search));
   if(colon < 0) return "";
   int start = StringFind(json, "{", colon + 1);
   if(start < 0) return "";
   int depth = 0;
   for(int i = start; i < StringLen(json); i++)
   {
      ushort ch = StringGetCharacter(json, i);
      if(ch == '{') depth++;
      if(ch == '}') depth--;
      if(depth == 0) return StringSubstr(json, start, i - start + 1);
   }
   return "";
}

ENUM_AI_DECISION CAI_Connector::ParseDecision(const string value)
{
   string v = value;
   StringToUpper(v);
   StringTrimLeft(v);  StringTrimRight(v);
   if(v == "BUY")  return AI_BUY;
   if(v == "SELL") return AI_SELL;
   return AI_HOLD;
}

ENUM_AI_RISK CAI_Connector::ParseRisk(const string value)
{
   string v = value;
   StringToUpper(v);
   StringTrimLeft(v);  StringTrimRight(v);
   if(v == "LOW")    return RISK_LOW;
   if(v == "MEDIUM") return RISK_MEDIUM;
   if(v == "HIGH")   return RISK_HIGH;
   return RISK_UNKNOWN;
}

//+------------------------------------------------------------------+
//| URL Parser                                                       |
//+------------------------------------------------------------------+
void CAI_Connector::ParseUrl(const string url, string &host, int &port, string &path, bool &useSSL)
{
   string work = url;
   useSSL = true;
   port = 443;

   if(StringFind(work, "https://") == 0)
   { work = StringSubstr(work, 8); useSSL = true; port = 443; }
   else if(StringFind(work, "http://") == 0)
   { work = StringSubstr(work, 7); useSSL = false; port = 80; }

   int slashPos = StringFind(work, "/");
   if(slashPos > 0)
   {
      host = StringSubstr(work, 0, slashPos);
      path = StringSubstr(work, slashPos);
   }
   else
   {
      host = work;
      path = "/";
   }

   int colonPos = StringFind(host, ":");
   if(colonPos > 0)
   {
      port = (int)StringToInteger(StringSubstr(host, colonPos + 1));
      host = StringSubstr(host, 0, colonPos);
   }
}

//+------------------------------------------------------------------+
//| HTTP POST via WinInet.dll                                        |
//+------------------------------------------------------------------+
bool CAI_Connector::HttpPost(const string url, const string headers_str,
                             const string body, string &response, int &http_code)
{
   string host = "", path = "/";
   int port = 443;
   bool useSSL = true;
   ParseUrl(url, host, port, path, useSSL);

   int hInternet = InternetOpenW("AXER-AI/3.0", 0, "", "", 0);
   if(hInternet == 0)
   {
      response = "InternetOpenW failed";
      http_code = -1;
      return false;
   }

   // Set timeouts to 60s (Render free tier cold start can take 30-50s)
   int timeout[1]; timeout[0] = 60000;
   InternetSetOptionW(hInternet, 2, timeout, 4); // INTERNET_OPTION_CONNECT_TIMEOUT
   InternetSetOptionW(hInternet, 5, timeout, 4); // INTERNET_OPTION_SEND_TIMEOUT
   InternetSetOptionW(hInternet, 6, timeout, 4); // INTERNET_OPTION_RECEIVE_TIMEOUT

   int hConnect = InternetConnectW(hInternet, host, port, "", "", 3, 0, 0);
   if(hConnect == 0)
   {
      InternetCloseHandle(hInternet);
      response = "InternetConnectW failed";
      http_code = -1;
      return false;
   }

   uint flags = 0x80000000 | 0x04000000; // INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE
   if(useSSL) flags |= 0x00800000;      // INTERNET_FLAG_SECURE

   int hRequest = HttpOpenRequestW(hConnect, "POST", path, "HTTP/1.1", "", 0, (int)flags, 0);
   if(hRequest == 0)
   {
      InternetCloseHandle(hConnect);
      InternetCloseHandle(hInternet);
      response = "HttpOpenRequestW failed";
      http_code = -1;
      return false;
   }

   uchar post_data[];
   StringToCharArray(body, post_data, 0, -1, CP_UTF8);
   int dataLen = ArraySize(post_data) - 1; // exclude null terminator

   if(!HttpSendRequestW(hRequest, headers_str, StringLen(headers_str), post_data, dataLen))
   {
      InternetCloseHandle(hRequest);
      InternetCloseHandle(hConnect);
      InternetCloseHandle(hInternet);
      response = "HttpSendRequestW failed";
      http_code = -1;
      return false;
   }

   response = "";
   uchar buf[1024];
   int read[1];
   while(true)
   {
      InternetReadFile(hRequest, buf, 1024, read);
      if(read[0] <= 0) break;
      response += CharArrayToString(buf, 0, read[0], CP_UTF8);
   }

   InternetCloseHandle(hRequest);
   InternetCloseHandle(hConnect);
   InternetCloseHandle(hInternet);

   http_code = 200;
   if(StringLen(response) == 0) { http_code = -1; return false; }
   return true;
}

//+------------------------------------------------------------------+
//| Health Check                                                     |
//+------------------------------------------------------------------+
bool CAI_Connector::CheckHealth(int &provider_count)
{
   string url = m_api_url + "/health";

   int hInternet = InternetOpenW("AXER-AI/3.0", 0, "", "", 0);
   if(hInternet == 0) return false;

   int hUrl = InternetOpenUrlW(hInternet, url, "", 0, 0, 0);
   if(hUrl == 0)
   {
      InternetCloseHandle(hInternet);
      return false;
   }

   string resp = "";
   uchar buf[1024];
   int read[1];
   while(true)
   {
      InternetReadFile(hUrl, buf, 1024, read);
      if(read[0] <= 0) break;
      resp += CharArrayToString(buf, 0, read[0], CP_UTF8);
   }

   InternetCloseHandle(hUrl);
   InternetCloseHandle(hInternet);

   provider_count = JsonGetInt(resp, "providers");
   return (JsonGetString(resp, "status") == "ok");
}

//+------------------------------------------------------------------+
//| Main Analyze                                                     |
//+------------------------------------------------------------------+
bool CAI_Connector::Analyze(ENUM_AI_MODEL model,
                            const string symbol, const string timeframe,
                            double bid, double ask, double spread, int digits,
                            double day_open, double day_change, double day_change_pct,
                            double rsi, double macd_main, double macd_signal, double macd_hist,
                            double atr, double bb_upper, double bb_middle, double bb_lower,
                            double stoch_k, double stoch_d,
                            double ma20, double ma50, double ma200,
                            const string trend,
                            double recent_high, double recent_low,
                            double balance, double equity, double free_margin,
                            const string server_time,
                            const AI_Candle &candles[], int candle_count,
                            const AI_Position &positions[], int pos_count,
                            AI_Result &result)
{
   result.Reset();

   string model_name = (model == MODEL_CUSTOM) ? m_custom_model : ModelToString(model);

   string body = BuildRequestBody(symbol, timeframe, model_name,
                                  bid, ask, spread, digits,
                                  day_open, day_change, day_change_pct,
                                  rsi, macd_main, macd_signal, macd_hist,
                                  atr, bb_upper, bb_middle, bb_lower,
                                  stoch_k, stoch_d,
                                  ma20, ma50, ma200, trend,
                                  recent_high, recent_low,
                                  balance, equity, free_margin,
                                  server_time, candles, candle_count,
                                  positions, pos_count);

   string headers = "Content-Type: application/json\r\nx-api-key: " + m_api_key + "\r\n";
   string response;
   int http_code;

   bool ok = HttpPost(m_api_url + "/analyze", headers, body, response, http_code);
   result.raw_response = response;

   if(!ok)
   {
      result.error_message = "HTTP " + IntegerToString(http_code) + ": " + response;
      PrintFormat("[AI] Request failed: %s", result.error_message);
      return false;
   }

   if(StringFind(response, "\"success\":true") < 0 && StringFind(response, "\"success\": true") < 0)
   {
      result.error_message = "API error: " + JsonGetString(response, "error");
      PrintFormat("[AI] %s", result.error_message);
      return false;
   }

   string analysis = JsonGetObject(response, "ai_analysis");
   if(analysis == "")
   {
      result.error_message = "Could not parse ai_analysis";
      return false;
   }

   result.success     = true;
   result.decision    = ParseDecision(JsonGetString(analysis, "decision"));
   result.confidence  = JsonGetInt(analysis, "confidence");
   result.entry_price = JsonGetDouble(analysis, "entry_price");
   result.stop_loss   = JsonGetDouble(analysis, "stop_loss");
   result.take_profit = JsonGetDouble(analysis, "take_profit");
   result.reason      = JsonGetString(analysis, "reason");
   result.risk_level  = ParseRisk(JsonGetString(analysis, "risk_level"));
   result.used_model  = JsonGetString(response, "used_model");
   result.analyzed_at = JsonGetString(response, "analyzed_at");

   string levels = JsonGetObject(analysis, "key_levels");
   if(levels != "")
   {
      result.support    = JsonGetDouble(levels, "support");
      result.resistance = JsonGetDouble(levels, "resistance");
   }

   result.from_cache          = (StringFind(response, "\"cached\":true") >= 0);
   result.coalesced           = (StringFind(response, "\"coalesced\":true") >= 0);
   result.cache_ttl_remaining = JsonGetInt(response, "cache_ttl_remaining");

   string tag = result.from_cache ? (result.coalesced ? "[COALESCED]" : "[CACHED]") : "[FRESH]";
   PrintFormat("[AI] %s %s | %s | Conf:%d%% | %s | %s",
               tag, symbol,
               (result.decision == AI_BUY ? "BUY" : (result.decision == AI_SELL ? "SELL" : "HOLD")),
               result.confidence, result.used_model, result.reason);
   return true;
}

//+------------------------------------------------------------------+
//| AnalyzeCurrentChart â€” MQL5 Version                               |
//+------------------------------------------------------------------+
#ifdef COMPAT_MQL5
bool CAI_Connector::AnalyzeCurrentChart(ENUM_AI_MODEL model, int candle_count, AI_Result &result)
{
   result.Reset();
   string symbol = _Symbol;
   int digits    = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   string tf_str = EnumToString(_Period);

   double bid    = SymbolInfoDouble(symbol, SYMBOL_BID);
   double ask    = SymbolInfoDouble(symbol, SYMBOL_ASK);
   double spread = ask - bid;

   double day_open      = iOpen(symbol, PERIOD_D1, 0);
   double day_change    = bid - day_open;
   double day_change_pct = (day_open > 0) ? (day_change / day_open * 100.0) : 0;

   int rsi_h = iRSI(symbol, _Period, 14, PRICE_CLOSE);
   double rsi_buf[]; ArraySetAsSeries(rsi_buf, true); CopyBuffer(rsi_h, 0, 0, 1, rsi_buf);
   double rsi = rsi_buf[0]; IndicatorRelease(rsi_h);

   int macd_h = iMACD(symbol, _Period, 12, 26, 9, PRICE_CLOSE);
   double mm[], ms[]; ArraySetAsSeries(mm, true); ArraySetAsSeries(ms, true);
   CopyBuffer(macd_h, 0, 0, 1, mm); CopyBuffer(macd_h, 1, 0, 1, ms);
   double macd_main = mm[0], macd_signal = ms[0], macd_hist = mm[0] - ms[0];
   IndicatorRelease(macd_h);

   int atr_h = iATR(symbol, _Period, 14);
   double ab[]; ArraySetAsSeries(ab, true); CopyBuffer(atr_h, 0, 0, 1, ab);
   double atr = ab[0]; IndicatorRelease(atr_h);

   int bb_h = iBands(symbol, _Period, 20, 0, 2.0, PRICE_CLOSE);
   double bbm[], bbu[], bbl[];
   ArraySetAsSeries(bbm, true); ArraySetAsSeries(bbu, true); ArraySetAsSeries(bbl, true);
   CopyBuffer(bb_h, 0, 0, 1, bbm); CopyBuffer(bb_h, 1, 0, 1, bbu); CopyBuffer(bb_h, 2, 0, 1, bbl);
   double bb_upper = bbu[0], bb_middle = bbm[0], bb_lower = bbl[0];
   IndicatorRelease(bb_h);

   int st_h = iStochastic(symbol, _Period, 5, 3, 3, MODE_SMA, STO_LOWHIGH);
   double sk[], sd[]; ArraySetAsSeries(sk, true); ArraySetAsSeries(sd, true);
   CopyBuffer(st_h, 0, 0, 1, sk); CopyBuffer(st_h, 1, 0, 1, sd);
   double stoch_k = sk[0], stoch_d = sd[0]; IndicatorRelease(st_h);

   int ma20_h = iMA(symbol, _Period, 20, 0, MODE_SMA, PRICE_CLOSE);
   int ma50_h = iMA(symbol, _Period, 50, 0, MODE_SMA, PRICE_CLOSE);
   int ma200_h = iMA(symbol, _Period, 200, 0, MODE_SMA, PRICE_CLOSE);
   double m20[], m50[], m200[];
   ArraySetAsSeries(m20, true); ArraySetAsSeries(m50, true); ArraySetAsSeries(m200, true);
   CopyBuffer(ma20_h, 0, 0, 1, m20); CopyBuffer(ma50_h, 0, 0, 1, m50); CopyBuffer(ma200_h, 0, 0, 1, m200);
   double ma20 = m20[0], ma50 = m50[0], ma200 = m200[0];
   IndicatorRelease(ma20_h); IndicatorRelease(ma50_h); IndicatorRelease(ma200_h);

   string trend = "SIDEWAYS";
   if(ma20 > ma50 && ma50 > ma200 && bid > ma20) trend = "UPTREND";
   else if(ma20 < ma50 && ma50 < ma200 && bid < ma20) trend = "DOWNTREND";

   int hi = iHighest(symbol, _Period, MODE_HIGH, 20, 0);
   int lo = iLowest(symbol, _Period, MODE_LOW, 20, 0);
   double recent_high = iHigh(symbol, _Period, hi);
   double recent_low  = iLow(symbol, _Period, lo);

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double fm      = AccountInfoDouble(ACCOUNT_MARGIN_FREE);

   string server_time = TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES);
   m_gmt_offset = (int)(TimeCurrent() - TimeGMT());

   if(candle_count > 100) candle_count = 100;
   AI_Candle candles[];
   ArrayResize(candles, candle_count);
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   CopyRates(symbol, _Period, 0, candle_count, rates);
   for(int i = 0; i < candle_count; i++)
   {
      candles[i].time   = TimeToString(rates[i].time, TIME_DATE | TIME_MINUTES);
      candles[i].open   = rates[i].open;
      candles[i].high   = rates[i].high;
      candles[i].low    = rates[i].low;
      candles[i].close  = rates[i].close;
      candles[i].volume = rates[i].tick_volume;
   }

   AI_Position positions[];
   int pos_count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || PositionGetString(POSITION_SYMBOL) != symbol) continue;
      ArrayResize(positions, pos_count + 1);
      positions[pos_count].ticket     = (long)ticket;
      positions[pos_count].type       = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      positions[pos_count].lots       = PositionGetDouble(POSITION_VOLUME);
      positions[pos_count].open_price = PositionGetDouble(POSITION_PRICE_OPEN);
      positions[pos_count].sl         = PositionGetDouble(POSITION_SL);
      positions[pos_count].tp         = PositionGetDouble(POSITION_TP);
      positions[pos_count].profit     = PositionGetDouble(POSITION_PROFIT);
      positions[pos_count].swap       = PositionGetDouble(POSITION_SWAP);
      pos_count++;
   }

   return Analyze(model, symbol, tf_str, bid, ask, spread, digits,
                  day_open, day_change, day_change_pct,
                  rsi, macd_main, macd_signal, macd_hist,
                  atr, bb_upper, bb_middle, bb_lower, stoch_k, stoch_d,
                  ma20, ma50, ma200, trend, recent_high, recent_low,
                  balance, equity, fm, server_time,
                  candles, candle_count, positions, pos_count, result);
}
#endif  // COMPAT_MQL5

//+------------------------------------------------------------------+
//| AnalyzeCurrentChart â€” MQL4 Version                               |
//+------------------------------------------------------------------+
#ifdef COMPAT_MQL4
bool CAI_Connector::AnalyzeCurrentChart(ENUM_AI_MODEL model, int candle_count, AI_Result &result)
{
   result.Reset();
   string symbol = Symbol();
   int digits    = (int)MarketInfo(symbol, MODE_DIGITS);

   string tf_str = "H1";
   switch(Period())
   {
      case PERIOD_M1:  tf_str = "M1";  break;
      case PERIOD_M5:  tf_str = "M5";  break;
      case PERIOD_M15: tf_str = "M15"; break;
      case PERIOD_M30: tf_str = "M30"; break;
      case PERIOD_H1:  tf_str = "H1";  break;
      case PERIOD_H4:  tf_str = "H4";  break;
      case PERIOD_D1:  tf_str = "D1";  break;
      case PERIOD_W1:  tf_str = "W1";  break;
      case PERIOD_MN1: tf_str = "MN1"; break;
   }

   double bid    = MarketInfo(symbol, MODE_BID);
   double ask    = MarketInfo(symbol, MODE_ASK);
   double spread = ask - bid;

   double day_open      = iOpen(symbol, PERIOD_D1, 0);
   double day_change    = bid - day_open;
   double day_change_pct = (day_open > 0) ? (day_change / day_open * 100.0) : 0;

   double rsi          = iRSI(symbol, 0, 14, PRICE_CLOSE, 0);
   double macd_main    = iMACD(symbol, 0, 12, 26, 9, PRICE_CLOSE, MODE_MAIN, 0);
   double macd_signal  = iMACD(symbol, 0, 12, 26, 9, PRICE_CLOSE, MODE_SIGNAL, 0);
   double macd_hist    = macd_main - macd_signal;
   double atr          = iATR(symbol, 0, 14, 0);
   double bb_upper     = iBands(symbol, 0, 20, 2, 0, PRICE_CLOSE, MODE_UPPER, 0);
   double bb_middle    = iBands(symbol, 0, 20, 2, 0, PRICE_CLOSE, MODE_MAIN, 0);
   double bb_lower     = iBands(symbol, 0, 20, 2, 0, PRICE_CLOSE, MODE_LOWER, 0);
   double stoch_k      = iStochastic(symbol, 0, 5, 3, 3, MODE_SMA, 0, MODE_MAIN, 0);
   double stoch_d      = iStochastic(symbol, 0, 5, 3, 3, MODE_SMA, 0, MODE_SIGNAL, 0);
   double ma20         = iMA(symbol, 0, 20, 0, MODE_SMA, PRICE_CLOSE, 0);
   double ma50         = iMA(symbol, 0, 50, 0, MODE_SMA, PRICE_CLOSE, 0);
   double ma200        = iMA(symbol, 0, 200, 0, MODE_SMA, PRICE_CLOSE, 0);

   string trend = "SIDEWAYS";
   if(ma20 > ma50 && ma50 > ma200 && bid > ma20) trend = "UPTREND";
   else if(ma20 < ma50 && ma50 < ma200 && bid < ma20) trend = "DOWNTREND";

   int hi = iHighest(symbol, 0, MODE_HIGH, 20, 0);
   int lo = iLowest(symbol, 0, MODE_LOW, 20, 0);
   double recent_high = iHigh(symbol, 0, hi);
   double recent_low  = iLow(symbol, 0, lo);

   double balance = AccountBalance();
   double equity  = AccountEquity();
   double fm      = AccountFreeMargin();

   string server_time = TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES);
   m_gmt_offset = (int)(TimeCurrent() - TimeGMT());

   if(candle_count > 100) candle_count = 100;
   AI_Candle candles[];
   ArrayResize(candles, candle_count);
   for(int i = 0; i < candle_count; i++)
   {
      candles[i].time   = TimeToString(iTime(symbol, 0, i), TIME_DATE | TIME_MINUTES);
      candles[i].open   = iOpen(symbol, 0, i);
      candles[i].high   = iHigh(symbol, 0, i);
      candles[i].low    = iLow(symbol, 0, i);
      candles[i].close  = iClose(symbol, 0, i);
      candles[i].volume = (long)iVolume(symbol, 0, i);
   }

   AI_Position positions[];
   int pos_count = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != symbol) continue;
      if(OrderType() > OP_SELL) continue;
      ArrayResize(positions, pos_count + 1);
      positions[pos_count].ticket     = OrderTicket();
      positions[pos_count].type       = (OrderType() == OP_BUY) ? "BUY" : "SELL";
      positions[pos_count].lots       = OrderLots();
      positions[pos_count].open_price = OrderOpenPrice();
      positions[pos_count].sl         = OrderStopLoss();
      positions[pos_count].tp         = OrderTakeProfit();
      positions[pos_count].profit     = OrderProfit();
      positions[pos_count].swap       = OrderSwap();
      pos_count++;
   }

   return Analyze(model, symbol, tf_str, bid, ask, spread, digits,
                  day_open, day_change, day_change_pct,
                  rsi, macd_main, macd_signal, macd_hist,
                  atr, bb_upper, bb_middle, bb_lower, stoch_k, stoch_d,
                  ma20, ma50, ma200, trend, recent_high, recent_low,
                  balance, equity, fm, server_time,
                  candles, candle_count, positions, pos_count, result);
}
#endif  // COMPAT_MQL4

#endif  // AI_CONNECTOR_MQH
