/** Types for the Node-style enquiry handler, used by the app's /api/contact route. */
export interface NodeLikeRequest {
  method: string;
  headers: Record<string, string>;
  socket?: { remoteAddress?: string };
  body?: unknown;
}
export interface NodeLikeResponse {
  statusCode: number;
  setHeader(key: string, value: string): void;
  end(data?: string): void;
}
export interface EnquiryFields { name: string; email: string; school: string; role: string; phone: string; message: string }
export function createContactHandler(options?: {
  env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; timeoutMs?: number;
  store?: ((fields: EnquiryFields, meta: { submissionId: string; origin: string }) => Promise<void>) | null;
}):
  (req: NodeLikeRequest, res: NodeLikeResponse) => Promise<void>;
declare const handler: ReturnType<typeof createContactHandler>;
export default handler;
