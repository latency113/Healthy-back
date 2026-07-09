import { Elysia } from "elysia";
import ExcelJS from 'exceljs';
import prisma from '../providers/database/database.provider';

export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  // 1. ดึงสถิติภาพรวม (Dashboard Overview)
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

  // 2. ระบบ CRUD: ดึงรายชื่อผู้ใช้งานทั้งหมด พร้อมจำนวนรายการที่บันทึก
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

  // 3. Data Extraction: ดาวน์โหลดข้อมูลประวัติการกินทั้งหมดเป็นไฟล์ Excel (.xlsx)
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
  });
