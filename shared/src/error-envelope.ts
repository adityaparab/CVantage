/** The error shape every CVantage API error uses (#14). */
export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp: string;
  path: string;
}
