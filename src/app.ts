"use strict";

import appInit from "./server";
import "dotenv/config";

const start = async () => {
  const app = await appInit({ logger: true });
  const port = (process.env.PORT || 3001) as number;
  try {
    await app.listen({ port });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
