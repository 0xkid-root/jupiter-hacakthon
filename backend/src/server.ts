import App from './index';
import { logger } from './utils/logger';

// Create server instance
const app = new App();
const server = app.listen();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: Error, promise: Promise<any>) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  logger.error(`Error: ${reason.message}`);
  logger.error(reason.stack);
  
  // Close server and exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  logger.error(`Error: ${err.name} - ${err.message}`);
  logger.error(err.stack);
  
  // Close server and exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  logger.info('SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    logger.info('💥 Process terminated!');
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  logger.error(`Error: ${err.name} - ${err.message}`);
  logger.error(err.stack);
  
  // Close server and exit process
  server.close(() => {
    process.exit(1);
  });
});
