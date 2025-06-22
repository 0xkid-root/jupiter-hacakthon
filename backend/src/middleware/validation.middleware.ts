import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { body, query, ValidationChain } from 'express-validator';
import { logger } from '../utils/logger';

/**
 * Middleware to validate request data using express-validator
 * @param validations Array of validation chains
 * @returns Middleware function
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    logger.warn('Validation failed', { 
      path: req.path, 
      method: req.method, 
      errors: errors.array() 
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  };
};

// Helper functions for validation rules
export const validationRules = {
  // Common validation chains
  requiredString: (field: string) => 
    body(field)
      .isString()
      .withMessage(`${field} must be a string`)
      .notEmpty()
      .withMessage(`${field} is required`),
      
  requiredQueryString: (field: string) =>
    query(field)
      .isString()
      .withMessage(`${field} must be a string`)
      .notEmpty()
      .withMessage(`${field} is required`),
      
  optionalString: (field: string) =>
    body(field)
      .optional()
      .isString()
      .withMessage(`${field} must be a string`),
      
  optionalQueryString: (field: string) =>
    query(field)
      .optional()
      .isString()
      .withMessage(`${field} must be a string`),
      
  requiredNumber: (field: string) =>
    body(field)
      .isNumeric()
      .withMessage(`${field} must be a number`)
      .notEmpty()
      .withMessage(`${field} is required`),
      
  optionalNumber: (field: string) =>
    body(field)
      .optional()
      .isNumeric()
      .withMessage(`${field} must be a number`),
      
  requiredBoolean: (field: string) =>
    body(field)
      .isBoolean()
      .withMessage(`${field} must be a boolean`)
      .notEmpty()
      .withMessage(`${field} is required`),
      
  optionalBoolean: (field: string) =>
    body(field)
      .optional()
      .isBoolean()
      .withMessage(`${field} must be a boolean`),

  // Route-specific validation chains
  getQuote: [
    query('inputMint')
      .isString()
      .withMessage('inputMint must be a string')
      .notEmpty()
      .withMessage('inputMint is required'),
    query('outputMint')
      .isString()
      .withMessage('outputMint must be a string')
      .notEmpty()
      .withMessage('outputMint is required'),
    query('amount')
      .isString()
      .withMessage('amount must be a string')
      .notEmpty()
      .withMessage('amount is required')
      .matches(/^\d+$/)
      .withMessage('amount must be a valid number string'),
    query('slippageBps')
      .optional()
      .isInt({ min: 0, max: 10000 })
      .withMessage('slippageBps must be an integer between 0 and 10000'),
    query('restrictIntermediateTokens')
      .optional()
      .isBoolean()
      .withMessage('restrictIntermediateTokens must be a boolean')
      .toBoolean(),
    query('swapMode')
      .optional()
      .isIn(['ExactIn', 'ExactOut'])
      .withMessage('swapMode must be either "ExactIn" or "ExactOut"'),
    query('feeBps')
      .optional()
      .isInt({ min: 0, max: 10000 })
      .withMessage('feeBps must be an integer between 0 and 10000'),
    query('onlyDirectRoutes')
      .optional()
      .isBoolean()
      .withMessage('onlyDirectRoutes must be a boolean')
      .toBoolean(),
    query('asLegacyTransaction')
      .optional()
      .isBoolean()
      .withMessage('asLegacyTransaction must be a boolean')
      .toBoolean(),
    query('maxAccounts')
      .optional()
      .isInt({ min: 1 })
      .withMessage('maxAccounts must be a positive integer'),
  ],
  buildSwap: [
    body('userPublicKey')
      .isString()
      .withMessage('userPublicKey must be a string')
      .notEmpty()
      .withMessage('userPublicKey is required'),
    body('inputMint')
      .isString()
      .withMessage('inputMint must be a string')
      .notEmpty()
      .withMessage('inputMint is required'),
    body('outputMint')
      .isString()
      .withMessage('outputMint must be a string')
      .notEmpty()
      .withMessage('outputMint is required'),
    body('amount')
      .isString()
      .withMessage('amount must be a string')
      .notEmpty()
      .withMessage('amount is required')
      .matches(/^\d+$/)
      .withMessage('amount must be a valid number string'),
    body('slippageBps')
      .optional()
      .isInt({ min: 0, max: 10000 })
      .withMessage('slippageBps must be an integer between 0 and 10000'),
    body('wrapAndUnwrapSol')
      .optional()
      .isBoolean()
      .withMessage('wrapAndUnwrapSol must be a boolean')
      .toBoolean(),
    body('asLegacyTransaction')
      .optional()
      .isBoolean()
      .withMessage('asLegacyTransaction must be a boolean')
      .toBoolean(),
    body('useSharedAccounts')
      .optional()
      .isBoolean()
      .withMessage('useSharedAccounts must be a boolean')
      .toBoolean(),
    body('computeUnitPriceMicroLamports')
      .optional()
      .isString()
      .withMessage('computeUnitPriceMicroLamports must be a string')
      .matches(/^\d+$/)
      .withMessage('computeUnitPriceMicroLamports must be a valid number string'),
    body('useVersionedTransaction')
      .optional()
      .isBoolean()
      .withMessage('useVersionedTransaction must be a boolean')
      .toBoolean(),
    body('asLegacyTransactionIfUnsupported')
      .optional()
      .isBoolean()
      .withMessage('asLegacyTransactionIfUnsupported must be a boolean')
      .toBoolean(),
  ],
};
