import { GoogleGenerativeAI } from '@google/generative-ai';

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const geminiModel = genAI.getGenerativeModel({ 
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: "application/json" } 
});
