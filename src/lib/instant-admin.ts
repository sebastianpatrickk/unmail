import { init } from "@instantdb/admin";
import schema from "@/instant.schema";

const defaultInstantApiUri = "https://instant-api.sebastianpatrickk.site";

let cachedDb: ReturnType<typeof init<typeof schema>> | null = null;

export function getInstantAdminDb() {
  const appId =
    process.env.INSTANT_APP_ID ?? process.env.NEXT_PUBLIC_INSTANT_APP_ID;
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN;
  const apiURI =
    process.env.INSTANT_API_URI ??
    process.env.NEXT_PUBLIC_INSTANT_API_URI ??
    defaultInstantApiUri;

  if (!appId) {
    throw new Error("INSTANT_APP_ID or NEXT_PUBLIC_INSTANT_APP_ID is required");
  }

  if (!adminToken) {
    throw new Error("INSTANT_APP_ADMIN_TOKEN is required");
  }

  if (!cachedDb) {
    cachedDb = init({
      appId,
      adminToken,
      schema,
      apiURI,
    });
  }

  return cachedDb;
}
