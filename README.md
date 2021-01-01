# next-auth-dynamodb

A dynamodb provider for [next-auth](https://next-auth.js.org/).

[![Coverage Status](https://coveralls.io/repos/github/tgandrews/next-auth-dynamodb/badge.svg?branch=main)](https://coveralls.io/github/tgandrews/next-auth-dynamodb?branch=main)

## Features

- Saving and retrieving of sessions from dynamodb
- Seeding of sessions for tests
- Retrieving of full linked provider information for a user

## Debugging

Debug logging is built in and to enable it set the environment variable `NEXT_AUTH_DYNAMODB_DEBUG` to any value.
This will return detailed information including the method called and additional information appropriate for that method.

### Example config

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

## Support

next-auth-dyanmodb is provided as-is, free of charge. For support, you have a few choices:

- Ask your support question on [Stackoverflow.com](http://stackoverflow.com), and tag your question with **next-auth-dynamodb**.
- If you believe you have found a bug in next-auth-dynamodb, please submit a support ticket on the [Github Issues page for next-auth-dynamodb](http://github.com/tgandrews/next-auth-dynamodb/issues).
