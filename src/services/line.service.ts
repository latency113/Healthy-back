const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

// 1. ฟังก์ชันดาวน์โหลดรูปภาพจาก LINE API
export async function downloadLineMessageContent(messageId: string): Promise<Buffer> {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { 'Authorization': `Bearer ${LINE_ACCESS_TOKEN}` }
  });
  if (!response.ok) throw new Error('Failed to download image from LINE');
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// 2. ฟังก์ชันส่งข้อความตอบกลับไปยังแอป LINE
export async function replyToLine(replyToken: string, textMessage: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: textMessage }]
    })
  });
}
// 3. ฟังก์ชันแสดง Loading Animation
export async function showLoadingAnimation(userId: string) {
  try {
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        chatId: userId,
        loadingSeconds: 20 // แสดงนานสุด 20 วินาที หรือจนกว่าจะมีการตอบกลับ
      })
    });
  } catch (error) {
    console.error("Loading Animation Error:", error);
  }
}

// 4. ฟังก์ชันส่งข้อความแบบ Push (สำหรับส่งข้อความหลังจาก replyToken ถูกใช้งานแล้ว)
export async function pushToLine(userId: string, textMessage: string) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: textMessage }]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error("Push to LINE failed:", errText);
    }
  } catch (error) {
    console.error("Push Message Error:", error);
  }
}
