import { GoogleGenerativeAI } from '@google/generative-ai';

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const geminiModel = genAI.getGenerativeModel({ 
  model: 'gemini-3.1-flash-lite',
  generationConfig: { responseMimeType: "application/json" } 
});
