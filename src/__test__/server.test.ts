import { test } from "tap";
import buildServer from "../server";
import { v4 as uuidv4 } from "uuid";

test("requests the `/healthcheck` route", async (t) => {
  const fastify = await buildServer({ logger: true });

  t.teardown(() => {
    fastify.close();
  });

  const response = await fastify.inject({
    method: "GET",
    url: "/healthcheck",
  });

  t.equal(response.statusCode, 200);
  t.same(response.json(), { status: "OK" });
});

test("POST / should success create item", async (t) => {
  const app = await buildServer();
  t.teardown(() => app.close());
  const response = await app.inject({
    method: "POST",
    url: "/submit-score",
    body: {
      userName: uuidv4(),
      score: 1000,
    },
  });
  t.equal(response.statusCode, 201);
});

test("GET / should success return items", async (t) => {
  const app = await buildServer();
  t.teardown(() => app.close());
  const response = await app.inject({
    method: "GET",
    url: "/top-scores",
  });
  t.equal(response.statusCode, 200);
});
