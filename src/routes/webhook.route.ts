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

        let user = await prisma.user.findUnique({ where: { lineUserId } });
        if (!user) {
          user = await prisma.user.create({ data: { lineUserId } });
        }

        if (messageType === 'image') {
          // Trigger loading animation and send initial response using replyToken
          await showLoadingAnimation(lineUserId);
          await replyToLine(replyToken, "กำลังวิเคราะห์รูปภาพอาหารของคุณ รอสักครู่นะครับ... 🍳");
          
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

            const summaryMessage = `📊 สรุปโภชนาการจากรูปภาพ:\n\n🍳 เมนู: ${aiResult.foodName}\n🔥 พลังงาน: ${aiResult.calories} kcal\n🥩 โปรตีน: ${aiResult.protein} กรัม\n🥑 ไขมัน: ${aiResult.fat} กรัม\n🍞 คาร์บ: ${aiResult.carbs} กรัม\n\nบันทึกประวัติการกินเรียบร้อยแล้วครับ!`;
            // Send final message using push (replyToken is already consumed)
            await pushToLine(lineUserId, summaryMessage);

          } catch (error) {
            console.error(error);
            // Send error message using push
            await pushToLine(lineUserId, "ขออภัยครับ ระบบไม่สามารถวิเคราะห์รูปภาพนี้ได้ ลองใหม่อีกครั้งนะครับ");
          }

        } else if (messageType === 'text') {
          const text: string = event.message.text.trim();

          if (text.startsWith('เพิ่ม ') || text.startsWith('ถามแคล ')) {
            const isSave = text.startsWith('เพิ่ม ');
            const foodQuery = text.replace('เพิ่ม ', '').replace('ถามแคล ', '');

            // Trigger loading animation and send initial response using replyToken
            await showLoadingAnimation(lineUserId);
            await replyToLine(replyToken, `กำลังค้นหาข้อมูลของ "${foodQuery}"... 🔍`);

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

              const summaryMessage = `📊 ผลลัพธ์โภชนาการ (${foodQuery}):\n\n🍳 เมนู: ${aiResult.foodName}\n🔥 พลังงาน: ${aiResult.calories} kcal\n🥩 โปรตีน: ${aiResult.protein} กรัม\n🥑 ไขมัน: ${aiResult.fat} กรัม\n🍞 คาร์บ: ${aiResult.carbs} กรัม\n\n${isSave ? '✅ บันทึกข้อมูลเรียบร้อย!' : '💡 ข้อมูลสำหรับเช็คแคลอรีเท่านั้น (ไม่ได้บันทึก)'}`;
              // Send final message using push (replyToken is already consumed)
              await pushToLine(lineUserId, summaryMessage);

            } catch (error) {
              console.error(error);
              // Send error message using push
              await pushToLine(lineUserId, "ขออภัยครับ ไม่พบข้อมูลโภชนาการของเมนูนี้");
            }
          }
        }
      }
    }
    return { success: true };
  });
