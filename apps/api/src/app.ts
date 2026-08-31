import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './env.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { questionsRouter } from './routes/questions.routes.js';
import { examsRouter } from './routes/exams.routes.js';
import { attemptsRouter } from './routes/attempts.routes.js';
import { hackerrankRouter } from './routes/hackerrank.routes.js';

export function createApp() {
  const app = express();

  // Behind nginx: needed for correct client IPs in rate limiting and audit logs.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header = same-origin or a server-to-server call (curl, health
        // checks). Browser cross-origin requests always send one.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );

  // CSV uploads arrive as a JSON string field, so the body cap has to clear them.
  app.use(express.json({ limit: '6mb' }));
  app.use(globalLimiter);

  app.get('/health', (_req, res) => res.json({ ok: true, env: env.NODE_ENV }));

  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/questions', questionsRouter);
  app.use('/exams', examsRouter);
  app.use('/attempts', attemptsRouter);
  app.use('/hackerrank', hackerrankRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
