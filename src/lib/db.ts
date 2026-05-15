import { init } from "@instantdb/react";
import schema from "../instant.schema";

const instantApiUri =
  process.env.NEXT_PUBLIC_INSTANT_API_URI ??
  "https://instant-api.sebastianpatrickk.site";

const instantWebsocketUri =
  process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI ??
  "wss://instant-api.sebastianpatrickk.site/runtime/session";

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,

  // Self-hosted InstantDB
  apiURI: instantApiUri,
  websocketURI: instantWebsocketUri,

  // DevTool config
  devtool: {
    position: "bottom-right",
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "unmail.sebastianpatrickk.site",
    ],
  },
});
