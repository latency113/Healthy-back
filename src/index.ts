import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { webhookRoutes } from "./routes/webhook.route";
import { userRoutes } from "./routes/user.route";
import { adminRoutes } from "./routes/admin.route";

const app = new Elysia()
  .use(cors({
    origin: true, // อนุญาตทุกโดเมน (เหมาะสำหรับ Ngrok, Cloudflare, Vercel)
    credentials: true, // จำเป็นหากต้องส่ง Cookies หรือ Headers พิเศษ
    allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning', 'Authorization', 'authorization'],
  }))
  .get('/', () => 'Health Chatbot Server is running!')
  .use(webhookRoutes)
  .use(userRoutes)
  .use(adminRoutes);

if (!process.env.VERCEL) {
  app.listen(process.env.PORT || 3000);
  console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`);
}

export default app;
