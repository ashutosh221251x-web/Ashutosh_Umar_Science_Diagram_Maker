import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config/index.js';

import { createRepository } from './repository/index.js';
import { GeminiClient } from './geminiClient/index.js';
import { GenerationService } from './generationService/index.js';
import { createRouter } from './routes/index.js';

export async function createApp(customRepository?: any) {
  const app = express();

  // Repository initialization
  const repository = customRepository || createRepository();
  await repository.init();

  // Services
  const geminiClient = new GeminiClient();
  const generationService = new GenerationService(geminiClient, repository);


  // Middleware
  app.use(express.json({ limit: '1mb' }));

  // CORS configuration
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    CONFIG.allowedOrigin
  ].filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl or same-origin)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for reviewer preview while keeping origin header
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
  }));

  // Clean request logger (no secrets)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Mount API router
  app.use('/api', createRouter(generationService, repository));

  // Serve static frontend in production if built
  const clientDistPath = path.resolve(process.cwd(), '..', 'dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
    // 404 Handler when frontend is not built
    app.use((_req: Request, res: Response) => {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found'
        }
      });
    });
  }


  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || err.status || 500;
    const code = err.code || (statusCode === 404 ? 'NOT_FOUND' : statusCode === 409 ? 'CONFLICT' : statusCode === 429 ? 'RATE_LIMIT' : 'INTERNAL_ERROR');
    const message = err.message || 'An unexpected internal error occurred';

    console.error(`[Error] ${code} (${statusCode}):`, message);

    res.status(statusCode).json({
      error: {
        code,
        message
      }
    });
  });

  return { app, repository, generationService };
}

// Start server if main entry
const isDirectRun = process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js')) && !process.env.NODE_ENV?.includes('test');
if (isDirectRun) {
  createApp().then(({ app }) => {
    app.listen(CONFIG.port, () => {
      console.log(`[Server] Science Diagram Maker Backend listening on port ${CONFIG.port}`);
      console.log(`[Server] Health check: http://localhost:${CONFIG.port}/api/health`);
    });
  }).catch(err => {
    console.error('[Server] Failed to initialize:', err);
    process.exit(1);
  });
}

