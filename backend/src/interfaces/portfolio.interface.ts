export interface TokenBalance {
  chainIndex: string;
  tokenContractAddress: string;
  symbol: string;
  balance: string;
  rawBalance: string;
  tokenPrice: string;
  isRiskToken: boolean;
  address: string;
  tokenType?: string;
  transferAmount?: string;
  availableAmount?: string;
}

export interface PortfolioBalance {
  userId: string;
  balances: TokenBalance[];
  totalValueUSD: string;
  lastUpdated: Date;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'SWAP' | 'TRANSFER' | 'BRIDGE';
  fromToken: {
    symbol: string;
    amount: string;
    address: string;
  };
  toToken: {
    symbol: string;
    amount: string;
    address: string;
  };
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  timestamp: Date;
  txHash: string;
  fee?: string;
  route?: string;
}