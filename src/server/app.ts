import type { Env } from '@/server/type';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from '@/lib/auth';
import { adminMiddleware } from './middlewares/admin';
import { authMiddleware } from './middlewares/auth';
import { betterAuthMiddleware } from './middlewares/better-auth';
import { getFeishuBot } from './feishu/bot';
import { agentRouter } from './routes/agent/route';
import { interviewRouter, studioInterviewsRouter } from './routes/interview/route';
import { resumeRouter } from './routes/resume/route';

export const app = new Hono<Env>()
  .use(
    '/api/auth/*',
    cors({
      origin: '*',
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['POST', 'GET', 'OPTIONS'],
      exposeHeaders: ['Content-Length'],
      maxAge: 600,
      credentials: true,
    }),
  )
  .on(['POST', 'GET'], '/api/auth/*', (c) => {
    return auth.handler(c.req.raw);
  })
  .use(betterAuthMiddleware)
  .use('/api/resume', authMiddleware)
  .use('/api/resume/*', authMiddleware)
  .use('/api/interview/parse-resume', authMiddleware)
  .use('/api/studio/interviews', authMiddleware, adminMiddleware)
  .use('/api/studio/interviews/*', authMiddleware, adminMiddleware)
  .basePath('/api')
  .post('/feishu/webhook', async (c) => {
    const bot = getFeishuBot();
    return bot.webhooks.feishu(c.req.raw);
  })
  .route('/agent', agentRouter)
  .route('/resume', resumeRouter)
  .route('/interview', interviewRouter)
  .route('/studio/interviews', studioInterviewsRouter);

app.notFound(c => c.json({ error: 'Not Found' }, 404));

export type AppType = typeof app;
