import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createMistral } from '@ai-sdk/mistral';
import { LanguageModel } from 'ai';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

// Use gemini-2.0-flash as the standard model via @ai-sdk/google
// which uses the Google AI SDK under the hood and supports current model names
export const getAIProvider = (modelId: string): LanguageModel => {
  switch (modelId) {
    case 'gemini-1.5-flash':
    case 'gemini-2.0-flash':
    case 'gemini-2.5-flash':
      return google('gemini-2.5-flash');
    case 'gemini-1.5-pro':
    case 'gemini-2.5-pro':
      return google('gemini-2.5-flash'); // fallback to flash for stability
    case 'gpt-4o': return openai('gpt-4o');
    case 'gpt-4-turbo': return openai('gpt-4-turbo');
    case 'gpt-3.5-turbo': return openai('gpt-3.5-turbo');
    case 'claude-3-5-sonnet': return anthropic('claude-3-5-sonnet-20240620');
    case 'claude-3-opus': return anthropic('claude-3-opus-20240229');
    case 'claude-3-haiku': return anthropic('claude-3-haiku-20240307');
    case 'mistral-large': return mistral('mistral-large-latest');
    case 'llama-3-70b':
      console.warn('Llama provider not installed. Falling back to gemini-2.0-flash.');
      return google('gemini-2.5-flash');
    default:
      console.warn(`Model ${modelId} not mapped, falling back to gemini-2.0-flash`);
      return google('gemini-2.5-flash');
  }
};
