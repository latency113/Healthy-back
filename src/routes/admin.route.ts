import { Elysia } from "elysia";
import { jwt } from '@elysiajs/jwt';
import ExcelJS from 'exceljs';
import prisma from '../providers/database/database.provider';
import { analyzeFoodImageWithGemini } from '../services/gemini.service';

export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  // Register JWT plugin
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET || 'gindee-default-jwt-secret-key-12345'
    })
  )



  // 2. LINE Login verification and JWT signing
  .post('/login', async ({ body, jwt, set }) => {
    const { idToken } = body as { idToken: string };
    if (!idToken) {
      set.status = 400;
      return { error: 'idToken is required' };
    }

    try {
      // Verify ID token with LINE OAuth2 API
      const params = new URLSearchParams();
      params.append('id_token', idToken);
      params.append('client_id', process.env.LINE_LOGIN_CHANNEL_ID || '');

      const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString()
      });

      if (!verifyRes.ok) {
        const errorData = await verifyRes.json().catch(() => ({}));
        set.status = 400;
        return { error: 'Failed to verify LINE ID Token', details: errorData };
      }

      const verified = await verifyRes.json() as { sub: string; name?: string; picture?: string };
      const lineUserId = verified.sub;

      if (!lineUserId) {
        set.status = 400;
        return { error: 'Invalid token payload received from LINE' };
      }

      // Check if the LINE user is whitelisted
      const whitelistEntry = await prisma.adminWhitelist.findUnique({
        where: { lineUserId }
      });

      if (!whitelistEntry) {
        set.status = 403;
        return { error: 'Forbidden: You do not have administrator privileges.' };
      }

      // Sign JWT token
      const token = await jwt.sign({
        lineUserId,
        displayName: whitelistEntry.displayName || verified.name || 'Admin',
        role: 'admin'
      });

      return {
        token,
        admin: {
          lineUserId,
          displayName: whitelistEntry.displayName || verified.name || 'Admin'
        }
      };
    } catch (error: any) {
      set.status = 500;
      return { error: 'Internal Server Error', details: error.message };
    }
  })

  // 3. Protected admin routes group
  .guard({
    async beforeHandle({ headers, jwt, set }) {
      const authHeader = headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        set.status = 401;
        return { error: 'Unauthorized: Missing or invalid token format' };
      }

      const token = authHeader.substring(7);
      const verified = await jwt.verify(token);

      if (!verified) {
        set.status = 401;
        return { error: 'Unauthorized: Invalid or expired token' };
      }
    }
  }, (app) => app
    // ดึงสถิติภาพรวม (Dashboard Overview)
    .get('/dashboard-stats', async () => {
      const totalUsers = await prisma.user.count();
      const totalFoodLogs = await prisma.foodLog.count();
      
      // นับจำนวนการใช้งานแยกตามประเภท (พิมพ์ VS ส่งรูป)
      const sourceStats = await prisma.foodLog.groupBy({
        by: ['sourceType'],
        _count: { sourceType: true },
      });

      return { 
        totalUsers, 
        totalFoodLogs, 
        sourceStats 
      };
    })

    // ระบบ CRUD: ดึงรายชื่อผู้ใช้งานทั้งหมด พร้อมจำนวนรายการที่บันทึก
    .get('/users', async () => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { foodLogs: true }
          }
        }
      });
      return users;
    })

    // Data Extraction: ดาวน์โหลดข้อมูลประวัติการกินทั้งหมดเป็นไฟล์ Excel (.xlsx)
    .get('/export-excel', async ({ set }) => {
      const logs = await prisma.foodLog.findMany({
        include: { user: true },
        orderBy: { loggedAt: 'desc' }
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Food_Logs_Research');

      worksheet.columns = [
        { header: 'Log ID', key: 'id', width: 35 },
        { header: 'LINE User ID', key: 'lineUserId', width: 35 },
        { header: 'ชื่อเมนูอาหาร', key: 'foodName', width: 25 },
        { header: 'ประเภทการส่ง', key: 'sourceType', width: 15 },
        { header: 'พลังงาน (kcal)', key: 'calories', width: 15 },
        { header: 'โปรตีน (g)', key: 'protein', width: 15 },
        { header: 'ไขมัน (g)', key: 'fat', width: 15 },
        { header: 'คาร์บ (g)', key: 'carbs', width: 15 },
        { header: 'วันเวลาที่บันทึก', key: 'loggedAt', width: 25 },
      ];

      logs.forEach(log => {
        worksheet.addRow({
          id: log.id,
          lineUserId: log.user.lineUserId,
          foodName: log.foodName,
          sourceType: log.sourceType === 'IMAGE' ? 'รูปภาพ' : 'ข้อความ',
          calories: log.calories,
          protein: log.protein,
          fat: log.fat,
          carbs: log.carbs,
          loggedAt: log.loggedAt.toLocaleString('th-TH'),
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      
      set.headers = {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Research_Data_Export.xlsx"'
      };

      return buffer;
    })

    // Get all whitelisted admins
    .get('/whitelist', async () => {
      return await prisma.adminWhitelist.findMany({
        orderBy: { createdAt: 'desc' }
      });
    })

    // Add user to whitelist
    .post('/whitelist', async ({ body, set }) => {
      const { lineUserId, displayName } = body as { lineUserId: string; displayName?: string };
      if (!lineUserId) {
        set.status = 400;
        return { error: 'lineUserId is required' };
      }

      const existing = await prisma.adminWhitelist.findUnique({
        where: { lineUserId }
      });
      if (existing) {
        return { success: true, message: 'Already whitelisted', data: existing };
      }

      const created = await prisma.adminWhitelist.create({
        data: {
          lineUserId,
          displayName: displayName || 'Admin'
        }
      });
      return { success: true, message: 'Successfully whitelisted', data: created };
    })

    // Remove user from whitelist
    .delete('/whitelist/:lineUserId', async ({ params, set }) => {
      const { lineUserId } = params;
      if (!lineUserId) {
        set.status = 400;
        return { error: 'lineUserId parameter is required' };
      }

      try {
        await prisma.adminWhitelist.delete({
          where: { lineUserId }
        });
        return { success: true, message: 'Successfully removed from whitelist' };
      } catch (err) {
        return { success: false, message: 'Whitelist entry not found' };
      }
    })

    // ==========================================
    // Food Logs & Submitted Images CRUD
    // ==========================================

    // 1. ดึงรายการบันทึกอาหาร / รูปภาพทั้งหมด พร้อมค้นหาและแบ่งหน้า
    .get('/food-logs', async ({ query }) => {
      const { userId, sourceType, hasImage, search, page, limit } = query as any;
      const where: any = {};
      if (userId) where.userId = userId;
      if (sourceType) where.sourceType = sourceType;
      if (hasImage === 'true') where.imageUrl = { not: null };
      if (search && search.trim()) {
        const term = search.trim();
        where.OR = [
          { foodName: { contains: term, mode: 'insensitive' } },
          { user: { displayName: { contains: term, mode: 'insensitive' } } },
          { user: { lineUserId: { contains: term, mode: 'insensitive' } } },
        ];
      }

      const pageNum = parseInt(page || '1', 10);
      const takeLimit = limit ? parseInt(limit, 10) : undefined;
      const skip = takeLimit && pageNum > 0 ? (pageNum - 1) * takeLimit : undefined;

      const [logs, total] = await Promise.all([
        prisma.foodLog.findMany({
          where,
          orderBy: { loggedAt: 'desc' },
          take: takeLimit,
          skip,
          include: {
            user: {
              select: {
                id: true,
                lineUserId: true,
                displayName: true,
              }
            }
          }
        }),
        prisma.foodLog.count({ where })
      ]);

      return { logs, total, page: pageNum, limit: takeLimit };
    })

    // 2. ดึงข้อมูลรายการอาหารเดี่ยว
    .get('/food-logs/:id', async ({ params: { id }, set }) => {
      const log = await prisma.foodLog.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              lineUserId: true,
              displayName: true,
            }
          }
        }
      });
      if (!log) {
        set.status = 404;
        return { error: 'Food log not found' };
      }
      return log;
    })

    // 3. สร้างรายการรูปภาพอาหารใหม่ (Create)
    .post('/food-logs', async ({ body, set }) => {
      const { userId, foodName, calories, protein, fat, carbs, imageUrl, sourceType, loggedAt } = body as any;
      if (!userId || !foodName) {
        set.status = 400;
        return { error: 'userId and foodName are required' };
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        set.status = 404;
        return { error: 'User not found' };
      }

      const newLog = await prisma.foodLog.create({
        data: {
          userId,
          foodName: foodName.trim(),
          calories: Number(calories) || 0,
          protein: Number(protein) || 0,
          fat: Number(fat) || 0,
          carbs: Number(carbs) || 0,
          imageUrl: imageUrl || null,
          sourceType: imageUrl ? 'IMAGE' : (sourceType || 'IMAGE'),
          loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              lineUserId: true,
              displayName: true,
            }
          }
        }
      });

      return { success: true, data: newLog };
    })

    // 4. แก้ไขข้อมูลรูปภาพหรือรายการอาหาร (Update)
    .put('/food-logs/:id', async ({ params: { id }, body, set }) => {
      const { foodName, calories, protein, fat, carbs, imageUrl, loggedAt, userId } = body as any;
      const existing = await prisma.foodLog.findUnique({ where: { id } });
      if (!existing) {
        set.status = 404;
        return { error: 'Food log not found' };
      }

      const updateData: any = {};
      if (foodName !== undefined) updateData.foodName = foodName.trim();
      if (calories !== undefined) updateData.calories = Number(calories) || 0;
      if (protein !== undefined) updateData.protein = Number(protein) || 0;
      if (fat !== undefined) updateData.fat = Number(fat) || 0;
      if (carbs !== undefined) updateData.carbs = Number(carbs) || 0;
      if (imageUrl !== undefined) {
        updateData.imageUrl = imageUrl;
        if (imageUrl) {
          updateData.sourceType = 'IMAGE';
        }
      }
      if (loggedAt !== undefined) updateData.loggedAt = new Date(loggedAt);
      if (userId !== undefined) updateData.userId = userId;

      const updated = await prisma.foodLog.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              lineUserId: true,
              displayName: true,
            }
          }
        }
      });

      return { success: true, data: updated };
    })

    // 5. ลบรายการรูปภาพอาหาร (Delete)
    .delete('/food-logs/:id', async ({ params: { id }, set }) => {
      try {
        const existing = await prisma.foodLog.findUnique({ where: { id } });
        if (!existing) {
          set.status = 404;
          return { error: 'Food log not found' };
        }
        await prisma.foodLog.delete({ where: { id } });
        return { success: true, message: 'ลบรายการเรียบร้อยแล้ว' };
      } catch (err: any) {
        set.status = 500;
        return { error: 'Failed to delete food log', details: err.message };
      }
    })

    // 6. วิเคราะห์รูปภาพด้วย Gemini AI (Auto-detect Nutrition)
    .post('/analyze-image', async ({ body, set }) => {
      const { image } = body as { image: string };
      if (!image) {
        set.status = 400;
        return { error: 'image is required' };
      }
      try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const aiResult = await analyzeFoodImageWithGemini(buffer);
        return { success: true, data: aiResult };
      } catch (err: any) {
        console.error('Gemini image analysis error:', err);
        set.status = 500;
        return { error: 'AI analysis failed', details: err.message };
      }
    })
  );
