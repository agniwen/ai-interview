import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { db } from './db';

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const trustedOrigins = [...new Set([baseURL, 'http://localhost:3000'])];

export const auth = betterAuth({
  appName: '简历筛选助手',
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  baseURL,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      enabled: true,
    },
  },
  plugins: [admin()],
  trustedOrigins,
});
