// Common types for the application

export interface Balance {
  available: string;
  stateStaked?: string;
  staked?: string;
  total?: string;
}

export interface Message {
  text: string | React.ReactNode;
  success: boolean;
}

export interface AuthRequest {
  accountId: string;
  signature: string;
  message?: string;
}

export interface UserData {
  userId: string;
  nearAccount: string;
  ethAddress: string;
  balance?: string;
}

export interface Transaction {
  txHash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
}
