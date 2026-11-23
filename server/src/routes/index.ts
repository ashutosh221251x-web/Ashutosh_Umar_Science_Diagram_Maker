import { Router, Request, Response, NextFunction } from 'express';
import { GenerateRequestSchema, ReviewUpdateRequestSchema, CONCEPT_MAP } from '../concepts/index.js';
import { GenerationService } from '../generationService/index.js';
import { IRepository } from '../repository/index.js';

export function createRouter(
  generationService: GenerationService,
  repository: IRepository
): Router {
  const router = Router();

  // GET /api/health
  router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const isDbHealthy = await repository.healthCheck();
      if (!isDbHealthy) {
        return res.status(503).json({
          error: {
            code: 'STORAGE_UNAVAILABLE',
            message: 'Database health check failed'
          }
        });
      }
      return res.status(200).json({ status: 'ok' });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/diagrams
  router.get('/diagrams', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const results = await repository.getAllDiagrams();
      return res.status(200).json({ results });
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/diagrams/generate
  router.post('/diagrams/generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parseResult = GenerateRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: `Invalid conceptId. Must be one of: ${Array.from(CONCEPT_MAP.keys()).join(', ')}`
          }
        });
      }

      const { conceptId } = parseResult.data;
      const { result, review } = await generationService.generate(conceptId);
      return res.status(200).json({ result, review });
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/reviews
  router.get('/reviews', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const reviews = await repository.getAllReviews();
      return res.status(200).json({ reviews });
    } catch (err) {
      return next(err);
    }
  });

  // PUT /api/diagrams/:conceptId/review
  router.put('/diagrams/:conceptId/review', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conceptId } = req.params;
      if (!CONCEPT_MAP.has(conceptId)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_CONCEPT',
            message: `Unknown conceptId: ${conceptId}`
          }
        });
      }

      const parseResult = ReviewUpdateRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: parseResult.error.issues.map(i => i.message).join(', ')
          }
        });
      }

      const { status, note } = parseResult.data;
      const updatedReview = await repository.saveReview(conceptId, status, note);
      return res.status(200).json({ review: updatedReview });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
