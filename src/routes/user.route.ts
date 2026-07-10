import { Elysia } from "elysia";
import prisma from '../providers/database/database.provider';

export const userRoutes = new Elysia()
  .get('/api/history/:lineUserId', async ({ params: { lineUserId } }) => {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        foodLogs: {
          orderBy: { loggedAt: 'desc' }
        }
      }
    });

    if (!user) return { error: "User not found" };
    return user.foodLogs;
  })
  .get('/api/user/profile/:lineUserId', async ({ params: { lineUserId } }) => {
    const user = await prisma.user.findUnique({
      where: { lineUserId }
    });
    if (!user) return { success: false, error: "User not found" };
    return { success: true, user };
  })
  .post('/api/submit-user-profile', async ({ body }) => {
    const { lineUserId, displayName, gender, weight, height, dailyCalorieGoal, birthday, goal, targetWeight, activityLevel } = body as any;
    if (!lineUserId) {
      throw new Error("lineUserId is required");
    }
    const user = await prisma.user.upsert({
      where: { lineUserId },
      update: {
        displayName,
        gender,
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        dailyCalorieGoal: dailyCalorieGoal ? parseInt(dailyCalorieGoal) : 2000,
        birthday: birthday ? new Date(birthday) : null,
        goal: goal || null,
        targetWeight: targetWeight ? parseFloat(targetWeight) : null,
        activityLevel: activityLevel || null,
      },
      create: {
        lineUserId,
        displayName,
        gender,
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        dailyCalorieGoal: dailyCalorieGoal ? parseInt(dailyCalorieGoal) : 2000,
        birthday: birthday ? new Date(birthday) : null,
        goal: goal || null,
        targetWeight: targetWeight ? parseFloat(targetWeight) : null,
        activityLevel: activityLevel || null,
      },
    });
    return { success: true, user };
  });
