import { AxiosError } from 'axios';

export class JupiterError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'JupiterError';
    
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JupiterError);
    }
  }

  static fromAxiosError(error: AxiosError): JupiterError {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const { status, data } = error.response;
      const errorData = data as any;
      
      return new JupiterError(
        errorData.message || error.message || 'Jupiter API error',
        status || 500,
        errorData.code,
        errorData.details
      );
    } else if (error.request) {
      // The request was made but no response was received
      return new JupiterError(
        'No response received from Jupiter API',
        504,
        'NO_RESPONSE'
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      return new JupiterError(
        error.message || 'Error setting up Jupiter API request',
        500,
        'REQUEST_SETUP_ERROR'
      );
    }
  }

  static isJupiterError(error: unknown): error is JupiterError {
    return error instanceof JupiterError;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      details: this.details,
      stack: this.stack
    };
  }
}

export class RateLimitError extends JupiterError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends JupiterError {
  constructor(message = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends JupiterError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class InsufficientLiquidityError extends JupiterError {
  constructor(message = 'Insufficient liquidity for this trade') {
    super(message, 400, 'INSUFFICIENT_LIQUIDITY');
    this.name = 'InsufficientLiquidityError';
  }
}

export class SlippageToleranceExceededError extends JupiterError {
  constructor(message = 'Slippage tolerance exceeded') {
    super(message, 400, 'SLIPPAGE_TOLERANCE_EXCEEDED');
    this.name = 'SlippageToleranceExceededError';
  }
}
