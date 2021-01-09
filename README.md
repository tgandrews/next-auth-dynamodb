# next-auth-dynamodb

A dynamodb provider for [next-auth](https://next-auth.js.org/).

[![Coverage Status](https://coveralls.io/repos/github/tgandrews/next-auth-dynamodb/badge.svg?branch=main)](https://coveralls.io/github/tgandrews/next-auth-dynamodb?branch=main)

## Features

- Saving and retrieving of sessions from dynamodb
- Seeding of sessions for tests
- Retrieving of full linked provider information for a user

## Example config

To use `next-auth-dynamodb` you need to provide it as an adapter in the `next-auth` config.

Here is an example config for use with GitHub login.

```ts
import { NextApiRequest, NextApiResponse } from "next";
import NextAuth, { InitOptions } from "next-auth";
import Providers from "next-auth/providers";
import NextAuthDynamodb from "next-auth-dynamodb";

const options: InitOptions = {
  debug: Boolean(process.env.NEXT_AUTH_DEBUG),
  providers: [
    Providers.GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: "user",
    }),
  ],
  adapter: NextAuthDynamodb,
  session: {
    jwt: false,
  },
};

export default (req: NextApiRequest, res: NextApiResponse) =>
  NextAuth(req, res, options);
```

## Tables

You need to ensure that three DynamoDB tables are created
The tables are `users`, `accounts` and `sessions`.

### Production

For production these need to exist in AWS.

Here is an example config using [aws-cdk](https://github.com/aws/aws-cdk)

```ts
import * as dynamodb from "@aws-cdk/aws-dynamodb";

const iamRole = // Some IAM role for the user you are using

const usersTable = new dynamodb.Table(this, "UsersTable", {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  tableName: "users",
  partitionKey: {
    name: "id",
    type: dynamodb.AttributeType.STRING,
  },
});
usersTable.addGlobalSecondaryIndex({
  indexName: "UserEmailIndex",
  partitionKey: {
    name: "email",
    type: dynamodb.AttributeType.STRING,
  },
});
usersTable.grantReadWriteData(iamRole);

const accountsTable = new dynamodb.Table(this, "AccountsTable", {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  tableName: "accounts",
  partitionKey: {
    name: "providerId",
    type: dynamodb.AttributeType.STRING,
  },
  sortKey: {
    name: "providerAccountId",
    type: dynamodb.AttributeType.STRING,
  },
});
accountsTable.grantReadWriteData(iamRole);

const sessionTable = new dynamodb.Table(this, "SessionTable", {
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  tableName: "sessions",
  partitionKey: {
    name: "id",
    type: dynamodb.AttributeType.STRING,
  },
});
sessionTable.addGlobalSecondaryIndex({
  indexName: "SessionUserIdIndex",
  partitionKey: {
    name: "userId",
    type: dynamodb.AttributeType.STRING,
  },
});
sessionsTable.grantReadWriteData(iamRole);
```

### Local development

For development you can seed the database with the accounts you require to avoid oauth flows. This
process also creates the tables in any locally running dynamodb instance. This is not recommended
as a way of creating users or tables in production.

I run this script as part of the boot process of the next app in development running before `next dev`.

```sh
#!/bin/bash
set -e

AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy

echo "starting Dynamo docker..."

DYNAMO_CONTAINER_ID=$(docker run -tid -P -e AWS_REGION=$AWS_REGION -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY amazon/dynamodb-local)
DYNAMO_HOST=$(docker port $DYNAMO_CONTAINER_ID 8000)

echo "dynamo started at: $DYNAMO_HOST"

function finish {
  echo "killing docker..."
  docker rm -vf $DYNAMO_CONTAINER_ID
}
trap finish EXIT

echo "waiting on Dynamo to start..."

./node_modules/.bin/wait-on http://$DYNAMO_HOST/shell

echo "Seeding db..."
MYAPP_AWS_REGION=${AWS_REGION} \
MYAPP_AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
MYAPP_AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
DYNAMODB_URL=http://${DYNAMO_HOST} \
NODE_ENV=development \
./node_modules/.bin/ts-node -O '{ "module": "commonjs" }' ./scripts/seed.ts

echo "Starting dev..."

MYAPP_AWS_REGION=${AWS_REGION} \
MYAPP_AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
MYAPP_AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
DYNAMODB_URL=http://${DYNAMO_HOST} \
NODE_ENV=development \
./node_modules/.bin/next dev "$@"
```

Seeding script that is run is here.

```ts
import { seedSession } from "next-auth-dynamodb";

(async () => {
  const sessionToken = await seedSession({
    email: "email@user.foobar",
    image: "https://some.jpg",
    name: "Some User",
    accounts: [
      {
        providerId: "some provider e.g. github, facebook, etc",
        providerAccountId: "account id",
        accessToken: "access token",
      },
    ],
  });
  console.log(`Session created`);
  console.log(`document.cookie = "next-auth.session-token=${sessionToken}";`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

## Debugging

Debug logging is built in and to enable it set the environment variable `NEXT_AUTH_DYNAMODB_DEBUG` to any value. This will return detailed information including the method called and additional information appropriate for that method.

## Support

next-auth-dyanmodb is provided as-is, free of charge. For support, you have a few choices:

- Ask your support question on [Stackoverflow.com](http://stackoverflow.com), and tag your question with **next-auth-dynamodb**.
- If you believe you have found a bug in next-auth-dynamodb, please submit a support ticket on the [Github Issues page for next-auth-dynamodb](http://github.com/tgandrews/next-auth-dynamodb/issues).
