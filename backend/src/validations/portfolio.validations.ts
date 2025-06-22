import { body, param } from 'express-validator';

export const routeValidations = {
  getPortfolio: [
    param('userId').isString().notEmpty(),
  ],
  addTransaction: [
    body('tokenAddress').isString().notEmpty(),
    body('amount').isNumeric(),
    body('price').isNumeric(),
    body('type').isIn(['buy', 'sell']),
    body('timestamp').isISO8601(),
  ],
  getTransactionHistory: [
    param('userId').isString().notEmpty(),
  ],
  getPortfolioValue: [
    param('userId').isString().notEmpty(),
  ],
};
