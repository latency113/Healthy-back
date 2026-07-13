import { Elysia } from "elysia";
import { jwt } from '@elysiajs/jwt';
import ExcelJS from 'exceljs';
import prisma from '../providers/database/database.provider';

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
  );
