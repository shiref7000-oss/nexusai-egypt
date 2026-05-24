import { Router } from 'express';
import adminRoutes from './admin';
import agentRoutes from './agents';
import aiRoutes from './ai';
import analyticsRoutes from './analytics';
import authRoutes from './auth';
import dashboardRoutes from './dashboard';
import integrationRoutes from './integrations';
import modelUsageRoutes from './modelUsage';
import orderRoutes from './orders';
import usageRoutes from './usage';

const apiRouter = Router();

// Aggregate all v1 routes
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/agents', agentRoutes);
apiRouter.use('/ai', aiRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/integrations', integrationRoutes);
apiRouter.use('/model-usage', modelUsageRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/usage', usageRoutes);

export default apiRouter;