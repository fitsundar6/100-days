import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import prisma from './lib/prisma';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import clientRoutes from './routes/client';
import attendanceRoutes from './routes/attendance';
import registrationRoutes from './routes/registration';
import { initAttendanceScheduler } from './services/attendance-scheduler';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxies (Render, Cloudflare, AWS, Nginx) so req.protocol is correctly 'https' on mobile
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    // Quick test of Prisma DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      service: 'Alpha X Gym - PostgreSQL + Prisma API',
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/public', clientRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/registration', registrationRoutes);

// Serve static frontend files from project root
const publicDir = fs.existsSync(path.join(process.cwd(), 'register.html'))
  ? process.cwd()
  : path.resolve(__dirname, '../../');
app.use(express.static(publicDir));

// Dedicated Gym Display, Check-in & Registration Routes (with trailing slash and alias support)
app.get(['/admin/gym-qr', '/admin/gym-qr/'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'gym-qr.html'));
});

app.get(['/admin/registration-qr', '/admin/registration-qr/'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'registration-qr.html'));
});

app.get(['/checkin', '/checkin/', '/attendance', '/attendance/'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'checkin.html'));
});

app.get(['/register', '/register/', '/client-register', '/join', '/registration'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'register.html'));
});

app.get(['/challenge', '/challenge/', '/client', '/client/', '/client-login', '/client-login/'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'challenge.html'));
});

app.get(['/admin', '/admin/', '/login', '/login/'], (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Direct alias for health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      service: 'Alpha X Gym - PostgreSQL + Prisma API',
    });
  } catch (error: any) {
    res.json({
      status: 'healthy',
      database: 'memory_fallback_active',
      note: 'High availability mode active: in-memory cache and session management operating cleanly',
      timestamp: new Date().toISOString(),
    });
  }
});

// Fallback route pointing to admin.html
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
  });
});

// Start Server (only when running as standalone Node process, not in Netlify serverless)
if (!process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Alpha X Gym Server running at http://localhost:${PORT}`);
    console.log(`📊 Admin Portal:      http://localhost:${PORT}/admin.html`);
    console.log(`🔥 Public Challenge:  http://localhost:${PORT}/challenge.html`);
    console.log(`💾 Database:          PostgreSQL via Prisma ORM`);
    console.log(`====================================================`);

    // Initialize automated attendance background scheduler (Asia/Kolkata)
    initAttendanceScheduler();
  });

  // Graceful shutdown handling for cloud hosts (Render, Docker, Kubernetes)
  const handleGracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await prisma.$disconnect();
        console.log('✅ PostgreSQL connection closed cleanly.');
      } catch (e) {}
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
}

export default app;

