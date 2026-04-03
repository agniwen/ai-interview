import type { Env } from '@/server/type';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from '@/lib/auth';
import { adminMiddleware } from './middlewares/admin';
import { authMiddleware } from './middlewares/auth';
import { betterAuthMiddleware } from './middlewares/better-auth';
import { chatTitleRouter } from './routes/chat-title/route';
import { chatRouter } from './routes/chat/route';
import { interviewRouter } from './routes/interview/route';
import { studioInterviewsRouter } from './routes/studio-interviews/route';

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
  .use('/api/chat', authMiddleware)
  .use('/api/chat-title', authMiddleware)
  .use('/api/interview/parse-resume', authMiddleware)
  .use('/api/interview/quota', authMiddleware)
  .use('/api/interview/quota', adminMiddleware)
  .use('/api/interview/report/*', authMiddleware)
  .use('/api/studio/interviews', authMiddleware)
  .use('/api/studio/interviews/*', authMiddleware)
  .use('/api/studio/interviews', adminMiddleware)
  .use('/api/studio/interviews/*', adminMiddleware)
  .basePath('/api')
  .route('/chat', chatRouter)
  .route('/chat-title', chatTitleRouter)
  .route('/interview', interviewRouter)
  .route('/studio/interviews', studioInterviewsRouter);

app.notFound(c => c.json({ error: 'Not Found' }, 404));

export type AppType = typeof app;
