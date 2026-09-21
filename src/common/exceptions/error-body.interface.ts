export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
