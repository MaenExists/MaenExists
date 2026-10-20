import { handleApiRequest } from "../../src/lib/admin-api.ts";

export async function onRequest(context: {
  request: Request;
  env: Record<string, any>;
  params: Record<string, any>;
  next: () => Promise<Response>;
}): Promise<Response> {
  return handleApiRequest(context.request, context.env);
}
