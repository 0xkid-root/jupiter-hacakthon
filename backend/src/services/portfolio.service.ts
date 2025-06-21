import { TokenBalance, PortfolioBalance, Transaction } from '../interfaces/portfolio.interface';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export class PortfolioService {
  private readonly okxApiUrl = 'https://web3.okx.com';

  constructor() {
    // Initialize with API configuration
    this.validateConfig();
  }

  private validateConfig() {
    const requiredEnvVars = ['API_KEY', 'SECRET_KEY', 'PASSPHRASE', 'PROJECT_ID'];
    requiredEnvVars.forEach(envVar => {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    });
  }

  private createSignature(timestamp: string, method: string, requestPath: string, body?: string): string {
    const message = timestamp + method + requestPath + (body || '');
    const hmac = require('crypto').createHmac('sha256', process.env.SECRET_KEY);
    return hmac.update(message).digest('base64');
  }

  async getTokenBalances(address: string, tokenAddresses: { chainIndex: string; tokenContractAddress: string }[]): Promise<TokenBalance[]> {
    try {
      const timestamp = new Date().toISOString();
      const requestPath = '/api/v5/dex/balance/token-balances-by-address';
      const method = 'POST';
      const body = JSON.stringify({ address, tokenContractAddresses: tokenAddresses });

      const signature = this.createSignature(timestamp, method, requestPath, body);

      const response = await axios.post(`${this.okxApiUrl}${requestPath}`, body, {
        headers: {
          'OK-ACCESS-KEY': process.env.API_KEY,
          'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': process.env.PASSPHRASE,
          'OK-ACCESS-PROJECT': process.env.PROJECT_ID,
          'Content-Type': 'application/json'
        }
      });

      return response.data.data[0].tokenAssets;
    } catch (error) {
      console.error('Error fetching token balances:', error);
      throw new Error('Failed to fetch token balances');
    }
  }

  async getPortfolioBalance(userId: string, address: string): Promise<PortfolioBalance> {
    try {
      // Get token balances from OKX API
      const tokenBalances = await this.getTokenBalances(address, []);
      
      // Calculate total value in USD
      const totalValueUSD = tokenBalances.reduce((total, token) => {
        const value = parseFloat(token.balance) * parseFloat(token.tokenPrice);
        return total + value;
      }, 0).toString();

      return {
        userId,
        balances: tokenBalances,
        totalValueUSD,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting portfolio balance:', error);
      throw new Error('Failed to get portfolio balance');
    }
  }

  async recordTransaction(userId: string, transactionData: Partial<Transaction>): Promise<Transaction> {
    try {
      const transaction: Transaction = {
        id: uuidv4(),
        userId,
        type: transactionData.type || 'SWAP',
        fromToken: transactionData.fromToken!,
        toToken: transactionData.toToken!,
        status: 'PENDING',
        timestamp: new Date(),
        txHash: transactionData.txHash!,
        fee: transactionData.fee,
        route: transactionData.route
      };

      // In a real implementation, save to database
      console.log('Recording transaction:', transaction);

      return transaction;
    } catch (error) {
      console.error('Error recording transaction:', error);
      throw new Error('Failed to record transaction');
    }
  }

  async getTransactionHistory(userId: string): Promise<Transaction[]> {
    // In a real implementation, fetch from database
    return [];
  }
}