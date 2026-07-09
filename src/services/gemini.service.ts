import { geminiModel } from "../config/gemini";

// 1. ฟังก์ชันส่งรูปไปให้ Gemini AI วิเคราะห์
export async function analyzeFoodImageWithGemini(imageBuffer: Buffer) {
  const prompt = `You are a nutrition expert specializing in Thai and international cuisine. Analyze this food image and estimate its nutritional values as accurately as possible. Return ONLY a valid JSON object with the required schema. Do not include markdown, explanations, or any extra text. :
  {
    "foodName": "ชื่อเมนูภาษาไทย",
    "calories": 0.0,
    "protein": 0.0,
    "fat": 0.0
    "carbs": 0.0
  }`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType: "image/jpeg"
    },
  };

  const result = await geminiModel.generateContent([prompt, imagePart]);
  const responseText = result.response.text().trim();
  const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  return {
    foodName: parsed.foodName || 'อาหารทั่วไป',
    calories: parseFloat(String(parsed.calories)) || 0,
    protein: parseFloat(String(parsed.protein)) || 0,
    fat: parseFloat(String(parsed.fat)) || 0,
    carbs: parseFloat(String(parsed.carbs)) || 0
  };
}

// 2. ฟังก์ชันส่งข้อความตัวอักษรไปให้ Gemini AI วิเคราะห์
export async function analyzeFoodTextWithGemini(foodName: string) {
  const prompt = `You are a nutrition expert. Estimate the nutritional values for "${foodName}". Return ONLY a valid JSON object matching the required schema. No markdown or extra text.:
  {
    "foodName": "ชื่อเมนูภาษาไทยที่ถูกต้องและเป็นมาตรฐาน",
    "calories": 0.0,
    "protein": 0.0,
    "fat": 0.0,
    "carbs": 0.0
  }`;

  const result = await geminiModel.generateContent(prompt);
  const responseText = result.response.text().trim();
  const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned);
  return {
    foodName: parsed.foodName || foodName,
    calories: parseFloat(String(parsed.calories)) || 0,
    protein: parseFloat(String(parsed.protein)) || 0,
    fat: parseFloat(String(parsed.fat)) || 0,
    carbs: parseFloat(String(parsed.carbs)) || 0
  };
}
