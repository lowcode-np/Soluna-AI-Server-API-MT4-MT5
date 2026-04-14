//+------------------------------------------------------------------+
//| SolunaAI_Example_EA.mq4 — AI Analysis Dashboard Example         |
//| Style: AXER AI Dark Theme with Dashboard Panel                   |
//+------------------------------------------------------------------+
#property copyright   "SolunaAI Example"
#property version     "1.00"
#property strict
#property description "Example EA showing AI_Connector usage with AXER-style dashboard."
#property description "Connects to AI API, displays analysis on chart panel."

#include <AI_Models.mqh>
#include <AI_Connector.mqh>

//+------------------------------------------------------------------+
//| Input Parameters                                                 |
//+------------------------------------------------------------------+
input ENUM_AI_MODEL InpModel       = MODEL_AUTO;  // AI Model
input string   CustomModelName     = "";           // Custom Model Name
input string   InpApiUrl           = "";           // API Url
input string   InpApiKey           = "";           // API Key
input int      PanelX              = 10;           // Panel X Position
input int      PanelY              = 20;           // Panel Y Position

//+------------------------------------------------------------------+
//| Global Variables                                                 |
//+------------------------------------------------------------------+
CAI_Connector g_ai;

string   g_aiTrend       = "SIDEWAYS";
string   g_aiDecision    = "HOLD";
double   g_aiConfidence  = 0;
string   g_aiReason      = "";
double   g_aiEntry       = 0;
double   g_aiSL          = 0;
double   g_aiTP          = 0;
string   g_aiRiskLevel   = "UNKNOWN";
string   g_aiModel       = "";
datetime g_aiLastUpdate  = 0;
bool     g_aiFromCache   = false;
bool     g_panelExpanded = true;

//+------------------------------------------------------------------+
//| OnInit                                                           |
//+------------------------------------------------------------------+
int OnInit()
{
   // Dark theme
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, C'15,15,25');
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, C'120,120,140');
   ChartSetInteger(0, CHART_COLOR_GRID, C'25,25,38');
   ChartSetInteger(0, CHART_COLOR_CANDLE_BEAR, clrWhite);
   ChartSetInteger(0, CHART_COLOR_CANDLE_BULL, clrGold);
   ChartSetInteger(0, CHART_COLOR_CHART_DOWN, C'200,200,210');
   ChartSetInteger(0, CHART_COLOR_CHART_UP, C'255,235,80');
   ChartSetInteger(0, CHART_MODE, CHART_CANDLES);
   ChartSetInteger(0, CHART_SHOW_GRID, true);

   // Init connector
   g_ai.SetApiUrl(InpApiUrl);
   g_ai.SetApiKey(InpApiKey);
   if(CustomModelName != "") g_ai.SetCustomModel(CustomModelName);

   DrawPanel();
   EventSetTimer(1);

   Print("SolunaAI Example EA initialized. Model: ", ModelToString(InpModel));
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| OnDeinit                                                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   DeleteAllObjects("SAI_");
   EventKillTimer();
}

//+------------------------------------------------------------------+
//| OnTick                                                           |
//+------------------------------------------------------------------+
void OnTick()
{
   RefreshAI();
}

//+------------------------------------------------------------------+
//| OnTimer                                                          |
//+------------------------------------------------------------------+
void OnTimer()
{
   DrawPanel();
}

//+------------------------------------------------------------------+
//| OnChartEvent — Panel Toggle                                      |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_CLICK)
   {
      if(sparam == "SAI_button")
      {
         g_panelExpanded = !g_panelExpanded;
         DeleteAllObjects("SAI_");
         DrawPanel();
      }
   }
}

//+------------------------------------------------------------------+
//| Refresh AI Analysis (on new H1 bar)                              |
//+------------------------------------------------------------------+
void RefreshAI()
{
   static datetime lastBarTime = 0;
   datetime currentBar = iTime(Symbol(), PERIOD_H1, 0);
   if(currentBar == lastBarTime && g_aiLastUpdate > 0) return;
   if(IsTesting()) return;

   Print("AI: Requesting analysis...");
   AI_Result result;
   bool ok = g_ai.AnalyzeCurrentChart(InpModel, 10, result);

   if(!ok)
   {
      Print("AI: Failed - ", result.error_message);
      lastBarTime = currentBar;
      return;
   }

   // Update globals
   g_aiDecision   = (result.decision == AI_BUY ? "BUY" : (result.decision == AI_SELL ? "SELL" : "HOLD"));
   g_aiConfidence = (double)result.confidence;
   g_aiReason     = result.reason;
   g_aiEntry      = result.entry_price;
   g_aiSL         = result.stop_loss;
   g_aiTP         = result.take_profit;
   g_aiRiskLevel  = (result.risk_level == RISK_LOW ? "LOW" : (result.risk_level == RISK_MEDIUM ? "MEDIUM" : (result.risk_level == RISK_HIGH ? "HIGH" : "UNKNOWN")));
   g_aiModel      = result.used_model;
   g_aiFromCache  = result.from_cache;

   if(g_aiDecision == "BUY")       g_aiTrend = "BULLISH";
   else if(g_aiDecision == "SELL") g_aiTrend = "BEARISH";
   else                            g_aiTrend = "SIDEWAYS";

   g_aiLastUpdate = TimeCurrent();
   lastBarTime = currentBar;

   string tag = result.from_cache ? "[CACHED]" : "[FRESH]";
   Print("AI: ", tag, " ", g_aiDecision, " (", DoubleToString(g_aiConfidence, 0), "%) Model: ", g_aiModel);

   DrawPanel();
}

//+------------------------------------------------------------------+
//| Draw Dashboard Panel                                             |
//+------------------------------------------------------------------+
void DrawPanel()
{
   if(!g_panelExpanded)
   {
      RectLbl("SAI_main", PanelX, PanelY, 250, 32, C'20,27,34', clrGold);
      PutLbl("SAI_logo", PanelX+15, PanelY+6, "SolunaAI", 10, clrWhite);
      PutLbl("SAI_button", PanelX+220, PanelY+7, "[+]", 8, clrSilver);
      return;
   }

   int panelH = 350;
   RectLbl("SAI_main", PanelX, PanelY, 250, panelH, C'20,27,34', clrGold);
   PutLbl("SAI_logo", PanelX+15, PanelY+6, "SolunaAI", 10, clrWhite);
   PutLbl("SAI_ver", PanelX+80, PanelY+8, "Example v1.0", 8, clrDimGray);
   PutLbl("SAI_button", PanelX+220, PanelY+7, "[X]", 8, clrSilver);

   // --- Trend Section ---
   RectLbl("SAI_trend_box", PanelX+10, PanelY+30, 230, 55, C'15,15,25', clrDimGray);
   color trendClr = (g_aiTrend == "BULLISH") ? clrLimeGreen : (g_aiTrend == "BEARISH") ? clrCrimson : clrGray;
   string sym = (g_aiTrend == "BULLISH") ? "Ç" : (g_aiTrend == "BEARISH") ? "È" : "G";
   PutLbl("SAI_trend_sym", PanelX+24, PanelY+40, sym, 16, trendClr, "Wingdings 3");
   PutLbl("SAI_trend_txt", PanelX+60, PanelY+40, g_aiTrend, 11, trendClr);
   DrawBar("SAI_trend_bar", g_aiConfidence, PanelX+60, PanelY+62);
   PutLbl("SAI_trend_pct", PanelX+60, PanelY+70, "Confidence: " + DoubleToString(g_aiConfidence, 0) + "%", 8, clrGray);

   // --- AI Analysis Section ---
   RectLbl("SAI_ai_box", PanelX+10, PanelY+90, 230, 120, C'15,15,25', clrDimGray);
   PutLbl("SAI_ai_title", PanelX+20, PanelY+95, "AI ANALYSIS", 9, clrGold);

   color decClr = (g_aiDecision == "BUY") ? clrLimeGreen : (g_aiDecision == "SELL") ? clrCrimson : clrGray;
   PutLbl("SAI_ai_dec_lbl", PanelX+20, PanelY+115, "Decision:", 8, clrGray);
   PutLbl("SAI_ai_dec_val", PanelX+80, PanelY+115, g_aiDecision, 8, decClr);
   PutLbl("SAI_ai_risk_lbl", PanelX+130, PanelY+115, "Risk:", 8, clrGray);
   PutLbl("SAI_ai_risk_val", PanelX+160, PanelY+115, g_aiRiskLevel, 8, clrWhite);

   PutLbl("SAI_ai_model_lbl", PanelX+20, PanelY+135, "Model:", 8, clrGray);
   string modelShort = (StringLen(g_aiModel) > 25) ? StringSubstr(g_aiModel, 0, 25) + ".." : g_aiModel;
   PutLbl("SAI_ai_model_val", PanelX+60, PanelY+135, modelShort, 8, clrWhite);

   string cacheTag = g_aiFromCache ? "[CACHED]" : "[FRESH]";
   PutLbl("SAI_ai_cache", PanelX+20, PanelY+155, cacheTag, 8, g_aiFromCache ? clrDodgerBlue : clrLimeGreen);

   string lastStr = (g_aiLastUpdate > 0) ? TimeToString(g_aiLastUpdate, TIME_MINUTES) : "---";
   PutLbl("SAI_ai_time_lbl", PanelX+80, PanelY+155, "Updated:", 8, clrGray);
   PutLbl("SAI_ai_time_val", PanelX+130, PanelY+155, lastStr, 8, clrWhite);

   PutLbl("SAI_ai_conf_lbl", PanelX+20, PanelY+175, "Confidence:", 8, clrGray);
   PutLbl("SAI_ai_conf_val", PanelX+85, PanelY+175, DoubleToString(g_aiConfidence, 0) + "%", 8, clrWhite);

   // --- Key Levels Section ---
   RectLbl("SAI_lv_box", PanelX+10, PanelY+215, 230, 60, C'15,15,25', clrDimGray);
   PutLbl("SAI_lv_title", PanelX+20, PanelY+220, "KEY LEVELS", 9, clrGold);
   PutLbl("SAI_lv_entry_lbl", PanelX+20, PanelY+240, "Entry:", 8, clrGray);
   PutLbl("SAI_lv_entry_val", PanelX+55, PanelY+240, DoubleToString(g_aiEntry, Digits), 8, clrWhite);
   PutLbl("SAI_lv_sl_lbl", PanelX+130, PanelY+240, "SL:", 8, clrGray);
   PutLbl("SAI_lv_sl_val", PanelX+148, PanelY+240, DoubleToString(g_aiSL, Digits), 8, clrCrimson);
   PutLbl("SAI_lv_tp_lbl", PanelX+20, PanelY+255, "TP:", 8, clrGray);
   PutLbl("SAI_lv_tp_val", PanelX+38, PanelY+255, DoubleToString(g_aiTP, Digits), 8, clrLimeGreen);

   // --- Reason Section ---
   RectLbl("SAI_reason_box", PanelX+10, PanelY+280, 230, 60, C'15,15,25', clrDimGray);
   PutLbl("SAI_reason_title", PanelX+20, PanelY+285, "REASON", 9, clrGold);
   string reason = (g_aiReason == "") ? "Waiting for AI analysis..." : g_aiReason;
   string wrapped = WrapTxt(reason, 38);
   PutMultiLbl("SAI_reason_", PanelX+20, PanelY+305, wrapped, 13, 8, clrWhite);
}

//+------------------------------------------------------------------+
//| UI Primitives (AXER-style)                                       |
//+------------------------------------------------------------------+
void PutLbl(string name, int x, int y, string text, int size, color col=clrWhite, string font="Segoe UI Semibold")
{
   if(ObjectFind(0, name) < 0) { ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0); ObjectSetInteger(0, name, OBJPROP_CORNER, 0); }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 15);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
}

void RectLbl(string name, int x, int y, int w, int h, color bg, color border)
{
   if(ObjectFind(0, name) < 0) { ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0); ObjectSetInteger(0, name, OBJPROP_CORNER, 0); }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_COLOR, border);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 10);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
}

void DrawBar(string name, double value, int x, int y)
{
   int totalW = 160, totalH = 6;
   RectLbl(name + "_bg", x, y, totalW, totalH, clrBlack, clrGray);
   int fw = (int)((totalW - 1) * (value / 100.0));
   color barClr = (value > 50) ? clrLimeGreen : clrCrimson;
   if(fw > 0) RectLbl(name, x + 1, y + 1, fw, totalH - 1, barClr, clrNONE);
   else ObjectDelete(0, name);
}

void PutMultiLbl(string prefix, int x, int y, string text, int lineH, int size, color col=clrWhite, string font="Segoe UI Semibold")
{
   string lines[];
   int num = StringSplit(text, '\n', lines);
   for(int i = 0; i < 20; i++)
   {
      string n = prefix + IntegerToString(i);
      if(i < num) PutLbl(n, x, y + (i * lineH), lines[i], size, col, font);
      else ObjectDelete(0, n);
   }
}

string WrapTxt(string text, int maxLen)
{
   string result = "";
   int len = StringLen(text);
   int pos = 0;
   while(pos < len)
   {
      int cut = maxLen;
      if(pos + cut >= len) { result += StringSubstr(text, pos); break; }
      int sp = -1;
      for(int i = pos + cut; i > pos; i--)
         if(StringGetChar(text, i) == ' ') { sp = i; break; }
      if(sp == -1) { result += StringSubstr(text, pos, cut) + "\n"; pos += cut; }
      else { result += StringSubstr(text, pos, sp - pos) + "\n"; pos = sp + 1; }
   }
   return result;
}

void DeleteAllObjects(string prefix)
{
   for(int i = ObjectsTotal() - 1; i >= 0; i--)
   {
      string n = ObjectName(i);
      if(StringSubstr(n, 0, StringLen(prefix)) == prefix) ObjectDelete(n);
   }
}
