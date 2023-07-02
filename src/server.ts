"use strict";

import fastify, { FastifyPluginCallback } from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import { version } from "../package.json";
import * as Pg from "pg";
import { SocketStream } from "@fastify/websocket";
import "dotenv/config";

interface UserScore {
  userName: string;
  score: number;
}

type FastifyPostgres =
  FastifyPluginCallback<fastifyPostgres.PostgresPluginOptions>;

declare namespace fastifyPostgres {
  export type PostgresDb = {
    pool: Pg.Pool;
    Client: Pg.Client;
    query: Pg.Pool["query"];
    connect: Pg.Pool["connect"];
    transact: typeof transact;
  };

  export type FastifyPostgresRouteOptions = {
    transact: boolean | string;
  };

  export type PostgresPluginOptions = {
    /**
     * Custom pg
     */
    pg?: typeof Pg;

    /**
     * Use pg-native
     */
    native?: boolean;

    /**
     * Instance name of fastify-postgres
     */
    name?: string;
  } & Pg.PoolConfig;

  export function transact<TResult>(
    fn: (client: Pg.PoolClient) => Promise<TResult>
  ): Promise<TResult>;

  export function transact<TResult>(
    fn: (client: Pg.PoolClient) => Promise<TResult>,
    cb: (error: Error | null, result?: TResult) => void
  ): void;

  export const fastifyPostgres: FastifyPostgres;
  export { fastifyPostgres as default };
}

declare module "fastify" {
  export interface FastifyInstance {
    pg: fastifyPostgres.PostgresDb & Record<string, fastifyPostgres.PostgresDb>;
  }

  export interface FastifyRequest {
    pg?: Pg.PoolClient;
  }

  export interface RouteShorthandOptions {
    pg?: fastifyPostgres.FastifyPostgresRouteOptions;
  }
}

const connectionString = process.env.DATABASE_URL;
console.log({ connectionString });

async function buildServer(opts = {}) {
  const app = fastify(opts);

  app.register(cors, {
    origin: (origin, cb) => {
      cb(null, true);
      // TO DO: Set CORS here
      // const hostname = new URL(origin).hostname;
      // if (hostname === "localhost") {
      //   //  Request from localhost will pass
      //   cb(null, true);
      //   return;
      // }
      // // Generate an error on other origins, disabling access
      // cb(new Error("Not allowed"), false);
    },
  });

  app.register(require("@fastify/postgres"), { connectionString });
  app.register(require("@fastify/websocket"), {
    options: {
      maxPayload: 1000, // in bytes
    },
  });

  app.get("/healthcheck", async function () {
    return { status: "OK" };
  });

  await app.register(swagger, {
    swagger: {
      info: {
        title: "Test swagger",
        description: "Testing the Fastify swagger API",
        version,
      },
      externalDocs: {
        url: "https://swagger.io",
        description: "Find more info here",
      },
      host: "localhost",
      schemes: ["http"],
      consumes: ["application/json"],
      produces: ["application/json"],
      tags: [{ name: "score", description: "Score related end-points" }],
      definitions: {
        Score: {
          type: "object",
          properties: {
            username: { type: "string" },
            score: { type: "integer" },
          },
        },
      },
      // TO DO: Set apiKey here
      // securityDefinitions: {
      //   apiKey: {
      //     type: 'apiKey',
      //     name: 'apiKey',
      //     in: 'header'
      //   }
      // }
    },
  });

  await app.register(require("@fastify/swagger-ui"), {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "full",
      deepLinking: false,
    },

    staticCSP: true,
    transformSpecificationClone: true,
  });

  app.register(async function (fastify) {
    fastify.get(
      "/scores",
      {
        schema: {
          description:
            "*** Warning *** this is not a get request , but is a websocket endpoint for subscribing to score data.",
          tags: ["score"],
          summary: "Subscribing to score data",
          response: {
            101: {
              description: "Switching Protocol",
              type: "null",
            },
          },
        },
        websocket: true,
      },
      async (connection: SocketStream, req) => {
        const client = await app.pg.connect();
        client.query("LISTEN score_update");
        client.on("notification", async (msg) => {
          const payload = msg.payload ? JSON.parse(msg.payload) : {};
          const event = payload.event;
          const table = payload.table;

          if (event === "INSERT") {
            // Perform the necessary actions for the insert event
            const query = `SELECT * FROM ${table} ORDER BY score DESC LIMIT 100`;
            const result = await client.query(query);
            const rows = result.rows;
            connection.socket.send(JSON.stringify(rows));
            return JSON.stringify(rows);
          }
          connection.socket.send("Hello Fastify WebSockets");
        });
      }
    );
  });

  app.get(
    "/top-scores",
    {
      schema: {
        description:
          "This is a get request for getting top 100 scores in the catcher game, in descending order",
        tags: ["score"],
        summary: "Gets the top 100 users' scores in the database",
        response: {
          200: {
            description: "Top 100 users' scores array",
            type: "array",
            items: {
              type: "object",
              properties: {
                username: { type: "string" },
                score: { type: "integer" },
              },
            },
          },
          400: {
            description: "Error response",
            type: "null",
          },
        },
      },
    },
    async (_, reply) => {
      const client = await app.pg.connect();
      const { rows } = await client.query(
        "SELECT * FROM scores ORDER BY score DESC"
      );
      client.release();
      if (!rows) return reply.code(400).send();
      reply.code(200).send(rows);
    }
  );

  app.post(
    "/submit-score",
    {
      schema: {
        description:
          "A post request for submitting a score to the database for a user",
        tags: ["score"],
        summary: "Submitting score",
        body: {
          type: "object",
          properties: {
            userName: { type: "string" },
            score: { type: "integer" },
          },
        },
        response: {
          201: {
            description: "Successful response",
            type: "integer",
          },
          400: {
            description: "Error response",
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async ({ body }, reply) => {
      const { userName, score } = body as UserScore;
      if (!userName || !score)
        return reply
          .code(400)
          .send({ error: "Either username or score is missing" });
      const client = await app.pg.connect();
      await client.query(
        "INSERT INTO scores (userName, score) VALUES ($1,$2)",
        [userName, score]
      );
      const { rows: rank } = await client.query(
        "SELECT rank FROM (SELECT userName, ROW_NUMBER() OVER (ORDER BY score DESC) AS rank FROM scores) AS r WHERE userName = $1",
        [userName]
      );
      client.release();
      if (!rank[0])
        return reply
          .code(400)
          .send({ error: "Something went wrong, please try again later" });
      reply.code(201).send(rank[0].rank);
    }
  );

  await app.ready();
  app.swagger();

  return app;
}

export default buildServer;
