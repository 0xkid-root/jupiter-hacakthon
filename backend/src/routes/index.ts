import { Router } from 'express';
import jupiterRoutes from './jupiter.routes';
import portfolioRoutes from './portfolio.routes';
import socialRoutes from './social.routes';
import chatRoutes from './chat.routes';

const router = Router();

/**
 * API Routes
 * All routes are prefixed with /api/v1
 */

// API v1 routes
const v1Router = Router();

// Jupiter API routes (trading functionality)
v1Router.use('/jupiter', jupiterRoutes);

// Portfolio management routes
v1Router.use('/portfolio', portfolioRoutes);

// Social features routes
v1Router.use('/social', socialRoutes);

// Chat functionality routes
v1Router.use('/chat', chatRoutes);

// Health check endpoint
v1Router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    timestamp: new Date().toISOString(),
    service: 'jupiter-hackathon-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Mount v1 routes under /api/v1
router.use('/v1', v1Router);

// 404 handler for /api/*
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
    availableEndpoints: [
      '/api/v1/jupiter/*',
      '/api/v1/portfolio/*',
      '/api/v1/social/*',
      '/api/v1/chat/*',
      '/api/v1/health'
    ]
  });
});

export default router;
