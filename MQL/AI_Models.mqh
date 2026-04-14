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
//| AI_Models.mqh - AI Model Definitions                             |
//| Updated: 2026-04-14                                              |
//| Excluded: paid_only, heavy reasoning, audio, specialized models  |
//| DO NOT EDIT - download new version from server when models change|
//+------------------------------------------------------------------+
#ifndef AI_MODELS_MQH
#define AI_MODELS_MQH

enum ENUM_AI_MODEL
{
   MODEL_AUTO              = 0,   // Auto
   // --- Pollinations: Fast & Free ---
   MODEL_OPENAI            = 1,   // OpenAI GPT-5.4 Nano
   MODEL_OPENAI_FAST       = 2,   // OpenAI GPT-5 Nano
   MODEL_DEEPSEEK          = 3,   // DeepSeek V3.2
   MODEL_GEMINI_FAST       = 4,   // Gemini 2.5 Flash Lite
   MODEL_CLAUDE_FAST       = 5,   // Claude Haiku 4.5
   MODEL_GROK              = 6,   // Grok 4.1 Fast
   MODEL_MISTRAL           = 7,   // Mistral Small 3.2
   MODEL_MISTRAL_LARGE     = 8,   // Mistral Large 3
   MODEL_NOVA_FAST         = 9,   // Amazon Nova Micro
   MODEL_NOVA              = 10,  // Amazon Nova 2 Lite
   MODEL_GLM               = 11,  // GLM-5.1
   MODEL_MINIMAX           = 12,  // MiniMax M2.5
   MODEL_QWEN_CODER        = 13,  // Qwen3 Coder 30B
   MODEL_QWEN_CODER_LARGE  = 14,  // Qwen3 Coder Next
   MODEL_PERPLEXITY_FAST   = 15,  // Perplexity Sonar
   // --- DeepInfra: Free Serverless ---
   MODEL_DI_DEEPSEEK_V32   = 16,  // DI: DeepSeek V3.2
   MODEL_DI_QWEN35_397B    = 17,  // DI: Qwen3.5 397B MoE
   MODEL_DI_QWEN35_122B    = 18,  // DI: Qwen3.5 122B MoE
   MODEL_DI_QWEN35_35B     = 19,  // DI: Qwen3.5 35B MoE
   MODEL_DI_QWEN35_27B     = 20,  // DI: Qwen3.5 27B Dense
   MODEL_DI_QWEN35_9B      = 21,  // DI: Qwen3.5 9B
   MODEL_DI_QWEN35_4B      = 22,  // DI: Qwen3.5 4B
   MODEL_DI_QWEN35_2B      = 23,  // DI: Qwen3.5 2B
   MODEL_DI_QWEN35_08B     = 24,  // DI: Qwen3.5 0.8B
   MODEL_DI_GEMMA4_26B     = 25,  // DI: Gemma 4 26B MoE
   MODEL_DI_GEMMA4_31B     = 26,  // DI: Gemma 4 31B
   MODEL_DI_NEMOTRON_120B  = 27,  // DI: Nemotron 3 Super 120B
   MODEL_DI_NEMOTRON_30B   = 28,  // DI: Nemotron 3 Nano 30B
   MODEL_DI_GLM51          = 29,  // DI: GLM-5.1
   MODEL_DI_GLM5           = 30,  // DI: GLM-5
   MODEL_DI_GLM47_FLASH    = 31,  // DI: GLM-4.7 Flash
   MODEL_DI_MINIMAX_M25    = 32,  // DI: MiniMax M2.5
   MODEL_DI_KIMI_K25       = 33,  // DI: Kimi K2.5
   MODEL_DI_STEP35_FLASH   = 34,  // DI: Step 3.5 Flash
   MODEL_CUSTOM            = 999  // Custom 
};

string ModelToString(ENUM_AI_MODEL model)
{
   switch(model)
   {
      // Pollinations
      case MODEL_OPENAI:            return "openai";
      case MODEL_OPENAI_FAST:       return "openai-fast";
      case MODEL_DEEPSEEK:          return "deepseek";
      case MODEL_GEMINI_FAST:       return "gemini-fast";
      case MODEL_CLAUDE_FAST:       return "claude-fast";
      case MODEL_GROK:              return "grok";
      case MODEL_MISTRAL:           return "mistral";
      case MODEL_MISTRAL_LARGE:     return "mistral-large";
      case MODEL_NOVA_FAST:         return "nova-fast";
      case MODEL_NOVA:              return "nova";
      case MODEL_GLM:               return "glm";
      case MODEL_MINIMAX:           return "minimax";
      case MODEL_QWEN_CODER:        return "qwen-coder";
      case MODEL_QWEN_CODER_LARGE:  return "qwen-coder-large";
      case MODEL_PERPLEXITY_FAST:   return "perplexity-fast";
      // DeepInfra
      case MODEL_DI_DEEPSEEK_V32:   return "deepseek-ai/DeepSeek-V3.2";
      case MODEL_DI_QWEN35_397B:    return "Qwen/Qwen3.5-397B-A17B";
      case MODEL_DI_QWEN35_122B:    return "Qwen/Qwen3.5-122B-A10B";
      case MODEL_DI_QWEN35_35B:     return "Qwen/Qwen3.5-35B-A3B";
      case MODEL_DI_QWEN35_27B:     return "Qwen/Qwen3.5-27B";
      case MODEL_DI_QWEN35_9B:      return "Qwen/Qwen3.5-9B";
      case MODEL_DI_QWEN35_4B:      return "Qwen/Qwen3.5-4B";
      case MODEL_DI_QWEN35_2B:      return "Qwen/Qwen3.5-2B";
      case MODEL_DI_QWEN35_08B:     return "Qwen/Qwen3.5-0.8B";
      case MODEL_DI_GEMMA4_26B:     return "google/gemma-4-26B-A4B-it";
      case MODEL_DI_GEMMA4_31B:     return "google/gemma-4-31B-it";
      case MODEL_DI_NEMOTRON_120B:  return "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B";
      case MODEL_DI_NEMOTRON_30B:   return "nvidia/Nemotron-3-Nano-30B-A3B";
      case MODEL_DI_GLM51:          return "zai-org/GLM-5.1";
      case MODEL_DI_GLM5:           return "zai-org/GLM-5";
      case MODEL_DI_GLM47_FLASH:    return "zai-org/GLM-4.7-Flash";
      case MODEL_DI_MINIMAX_M25:    return "MiniMaxAI/MiniMax-M2.5";
      case MODEL_DI_KIMI_K25:       return "moonshotai/Kimi-K2.5";
      case MODEL_DI_STEP35_FLASH:   return "stepfun-ai/Step-3.5-Flash";
      case MODEL_CUSTOM:            return CustomModelName;
      default:                      return "auto";
   }
}

#endif
