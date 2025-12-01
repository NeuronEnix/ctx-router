import { createClient } from "@redis/client";

export const ctxRedisClient = createClient();
// ctxRedisClient.connect();
