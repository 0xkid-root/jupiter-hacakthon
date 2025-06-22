import { Server } from 'http';
import App from './index';
import logger from './utils/logger';
import { database } from './db';

// Store server instance
let server: Server;

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`\n${signal} received. Shutting down gracefully...`);
  
  try {
    if (server) {
      server.close(async () => {
        logger.info('HTTP server closed');
        await database.close();
        logger.info('Database connection closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    } else {
      await database.close();
      logger.info('Database connection closed');
      process.exit(0);
    }
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle database connection and start server
const startServer = async (): Promise<void> => {
  try {
    // Initialize database connection
    logger.info('🔄 Connecting to database...');
    await database.connect();
    logger.info('✅ Database connected successfully');

    // Create and start the Express app
    const app = new App();
    
    // Start the server using App's listen method
    server = app.listen();
    
    return new Promise((resolve) => {
      logger.info('-----------------------------------');
      resolve();
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    throw error;
  }
};

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Handle process termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
