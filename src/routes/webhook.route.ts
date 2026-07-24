import { Elysia } from "elysia";
import prisma from '../providers/database/database.provider';
import { downloadLineMessageContent, replyToLine, pushToLine, showLoadingAnimation } from '../services/line.service';
import { analyzeFoodImageWithGemini, analyzeFoodTextWithGemini } from '../services/gemini.service';

export const webhookRoutes = new Elysia()
  .post('/webhook', async ({ body }) => {
    const events = (body as any).events;

    for (const event of events) {
      if (event.type === 'message') {
        const lineUserId = event.source.userId;
        const replyToken = event.replyToken;
        const messageType = event.message.type;
        const messageId = event.message.id;
        const web = process.env.WEB_URL;

        let user = await prisma.user.findUnique({ where: { lineUserId } });
        if (!user) {
          user = await prisma.user.create({ data: { lineUserId } });
        }

        if (messageType === 'image') {
          await showLoadingAnimation(lineUserId);
          await replyToLine(replyToken, "กำลังวิเคราะห์รูปภาพอาหารให้อยู่น้าา รอแป๊บนึงนะค้าบ... 🍳✨");
          try {
            const imageBuffer = await downloadLineMessageContent(messageId);
            const aiResult = await analyzeFoodImageWithGemini(imageBuffer);
            const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

            await prisma.foodLog.create({
              data: {
                userId: user.id,
                foodName: aiResult.foodName,
                calories: aiResult.calories,
                protein: aiResult.protein,
                fat: aiResult.fat,
                carbs: aiResult.carbs,
                imageUrl: base64Image,
                sourceType: 'IMAGE'
              }
            });

            const summaryMessage = `📊 สรุปโภชนาการจากรูปภาพมาแล้วค้าบ:\n\n🍳 เมนูคือ: ${aiResult.foodName}\n🔥 พลังงาน: ${aiResult.calories} kcal\n🥩 โปรตีน: ${aiResult.protein} กรัม\n🥑 ไขมัน: ${aiResult.fat} กรัม\n🍞 คาร์บ: ${aiResult.carbs} กรัม\n\n📝 แอดมินบันทึกประวัติการกิน ให้เรียบร้อยแล้วน๊า! 💖 \nเช็คประวัติการกินได้ที่นี่ ${web}`;

            await pushToLine(lineUserId, summaryMessage);

          } catch (error) {
            console.error(error);
            await pushToLine(lineUserId, "ระบบแอบงงงวย วิเคราะห์รูปภาพนี้ไม่ได้เลยค้าบ ลองส่งรูปมาให้ AI ดูใหม่อีกรอบน๊าา 📸✨");
          }

        } else if (messageType === 'text') {
          const text: string = event.message.text.trim();

          if (text.startsWith('เพิ่ม ') || text.startsWith('ถามแคล ')) {
            const isSave = text.startsWith('เพิ่ม ');
            const foodQuery = text.replace('เพิ่ม ', '').replace('ถามแคล ', '');

            await showLoadingAnimation(lineUserId);
            await replyToLine(replyToken, `กำลังค้นหาข้อมูลของเมนู "${foodQuery}" ให้อยู่น้าา รอแป๊บนึงนะค้าบ... 🔍✨`);
            try {
              const aiResult = await analyzeFoodTextWithGemini(foodQuery);

              if (isSave) {
                await prisma.foodLog.create({
                  data: {
                    userId: user.id,
                    foodName: aiResult.foodName,
                    calories: aiResult.calories,
                    protein: aiResult.protein,
                    fat: aiResult.fat,
                    carbs: aiResult.carbs,
                    sourceType: 'TEXT'
                  }
                });
              }

              const summaryMessage = `📊 ปิ๊งป่อง! ผลลัพธ์โภชนาการของ (${foodQuery}) มาแล้วค้าบ:\n\n🍳 เมนู: ${aiResult.foodName}\n🔥 พลังงาน: ${aiResult.calories} kcal\n🥩 โปรตีน: ${aiResult.protein} กรัม\n🥑 ไขมัน: ${aiResult.fat} กรัม\n🍞 คาร์บ: ${aiResult.carbs} กรัม\n\n${isSave ? `✅ เย้! บันทึกข้อมูลเข้าคลังเรียบร้อยค้าบ 📝 \nเช็คประวัติการกินได้ที่นี่ ${web}` : `💡 อันนี้ AI เช็คแคลอรีให้ดูเฉยๆ น้า ไม่ได้บันทึกลงไปค้าบ 🔍`}`;
              await pushToLine(lineUserId, summaryMessage);

            } catch (error) {
              console.error(error);
              await pushToLine(lineUserId, "โอ๊ะโอ! 😵‍💫 AI หาข้อมูลโภชนาการของเมนูนี้ไม่เจอเลยค้าบ ลองพิมพ์ชื่อเมนูแบบอื่นดูอีกทีน๊า 🧐");
            }
          }
        }
      }
    }
    return { success: true };
  });
