import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import apiRoutes from './routes';
import logger, { stream } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

class App {
  public app: Application;
  public env: string;
  public port: string | number;

  constructor() {
    this.app = express();
    this.env = config.NODE_ENV;
    this.port = config.PORT;

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  public listen() {
    const server = this.app.listen(this.port, () => {
      logger.info(`=================================`);
      logger.info(`======= ENV: ${this.env} =======`);
      logger.info(`🚀 App listening on port ${this.port}`);
      logger.info(`=================================`);
    });

    return server;
  }

  public getServer() {
    return this.app;
  }

  private initializeMiddlewares() {
    // Security headers
    this.app.use(helmet());

    // Enable CORS
    this.app.use(cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
    }));

    // Request logging
    this.app.use(morgan('combined', { stream }));

    // Body parser
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private initializeRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'UP', 
        timestamp: new Date().toISOString(),
        environment: this.env,
      });
    });

    // API Routes
    this.app.use(config.API_PREFIX, apiRoutes);

    // 404 handler for un-matched routes
    this.app.all('*', notFoundHandler);
  }

  private initializeErrorHandling() {
    this.app.use(errorHandler);
  }
}

export default App;
