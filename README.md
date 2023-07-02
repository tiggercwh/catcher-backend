# Catcher Game (Backend)

This is the backend repository for the catcher game.
TechStack: NodeJS (Fastify), Typescript, Swagger, PostgreSQL

## Getting Started

First, install the required packages. This repo assumes one using yarn but other major package manager (npm,pnpm) should be fine either.

Then, run the development server:

```bash
yarn  dev
# or
npm  run  dev
# or
pnpm  dev
```

Then the server should be running at http://localhost:3001 (3001 is the default port).
The APIs can be viewed at http://localhost:3001/documentation, which has a documentation built on top of Swagger.

## Environment Variables and DB construction

Please refer to `.env.example` and put corresponding variables.
A database need to be created with postgresql beforehand and a trigger need to implemented in the db for the websocket api to function properly.
One may refer to the example below:

```bash
# Assuming a database is created..
# Create a function to invoke when trigger happens
CREATE OR REPLACE FUNCTION score_update_trigger() RETURNS TRIGGER AS $$
DECLARE
score_update JSON;
BEGIN
IF TG_OP = 'INSERT' THEN
score_update = json_build_object(
'event', TG_OP,
'table', TG_TABLE_NAME
);
PERFORM pg_notify('score_update', score_update::text);
END IF;
RETURN NEW;
END;
$$
LANGUAGE plpgsql;

# Create trigger for database insert (new score)
CREATE OR REPLACE TRIGGER score_update
AFTER INSERT ON scores
FOR EACH ROW
EXECUTE PROCEDURE score_update_trigger();
$$
```

## Testing

Simple tests are written in `src/_test_` directory.
Test can be run `yarn test` or equivalent statement of your preferred package manager.

## Missing features (To be added):

- **Deploying Support**: This repo does not contain yaml/docker files to help constructing a db and deploying the application.
- **Structuring**: Now the main file (server.ts) is not ideal in terms of structure, types and plugins shall be abstracted in the future.
