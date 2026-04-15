import type { Env } from '@/server/type';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from '@/lib/auth';
import { getFeishuBot } from './feishu/bot';
import { adminMiddleware } from './middlewares/admin';
import { authMiddleware } from './middlewares/auth';
import { betterAuthMiddleware } from './middlewares/better-auth';
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
    try {
      const bot = getFeishuBot();
      const body = await c.req.text();
      const rebuilt = new Request(c.req.raw.url, {
        method: 'POST',
        headers: c.req.raw.headers,
        body,
      });
      const res = await bot.webhooks.feishu(rebuilt);
      const responseBody = await res.text();
      console.log('[feishu-webhook]', res.status, responseBody);
      return new Response(responseBody, {
        status: res.status,
        headers: res.headers,
      });
    }
    catch (error) {
      const stack = error instanceof Error ? error.stack : String(error);
      console.error('[feishu-webhook] failed:', stack);
      return c.json({ error: 'feishu-webhook failed', detail: String(error) }, 500);
    }
  })
  .route('/agent', agentRouter)
  .route('/resume', resumeRouter)
  .route('/interview', interviewRouter)
  .route('/studio/interviews', studioInterviewsRouter);

app.notFound(c => c.json({ error: 'Not Found' }, 404));

export type AppType = typeof app;
