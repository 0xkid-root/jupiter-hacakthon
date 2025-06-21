import { Request, Response } from 'express';
import { PortfolioService } from '../services/portfolio.service';

export class PortfolioController {
  private portfolioService: PortfolioService;

  constructor() {
    this.portfolioService = new PortfolioService();
  }

  async getTokenBalances(req: Request, res: Response): Promise<void> {
    try {
      const { address, tokenAddresses } = req.body;
      const balances = await this.portfolioService.getTokenBalances(address, tokenAddresses);
      res.status(200).json(balances);
    } catch (error) {
      console.error('Error fetching token balances:', error);
      res.status(500).json({ error: 'Failed to fetch token balances' });
    }
  };

  async getPortfolioBalance(req: Request, res: Response): Promise<void> {
    try {
      const { userId, address } = req.params;
      const portfolio = await this.portfolioService.getPortfolioBalance(userId, address);
      res.status(200).json(portfolio);
    } catch (error) {
      console.error('Error fetching portfolio balance:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio balance' });
    }
  };

  async recordTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const transactionData = req.body;
      const transaction = await this.portfolioService.recordTransaction(userId, transactionData);
      res.status(201).json(transaction);
    } catch (error) {
      console.error('Error recording transaction:', error);
      res.status(500).json({ error: 'Failed to record transaction' });
    }
  };

  async getTransactionHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const transactions = await this.portfolioService.getTransactionHistory(userId);
      res.status(200).json(transactions);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
  };
}