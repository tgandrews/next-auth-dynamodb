import type { Adapter } from "next-auth/adapters";
import Omanyd, { Options } from "omanyd";
import Joi from "joi";
import pino from "pino";

const LOGGING_ENABLED = Boolean(process.env.NEXT_AUTH_DYNAMODB_DEBUG);
const logger = pino({ enabled: LOGGING_ENABLED });

export interface User {
  id: string;
  name: string;
  email?: null | string;
  image: string;
  emailVerified?: boolean;
}

export const userDefinition: Options = {
  name: "users",
  hashKey: "id",
  schema: Joi.object({
    id: Omanyd.types.id(),
    email: Joi.string(),
    name: Joi.string(),
    image: Joi.string(),
    emailVerified: Joi.boolean(),
  }).unknown(true),
  indexes: [{ hashKey: "email", name: "UserEmailIndex", type: "global" }],
};

const UserStore = Omanyd.define<User>(userDefinition);

interface Account {
  providerId: string;
  providerAccountId: string;
  userId: string;
  providerType: string;
  refreshToken?: string;
  accessToken: string;
  accessTokenExpires?: number;
}

const AccountStore = Omanyd.define<Account>({
  name: "accounts",
  hashKey: "providerId",
  rangeKey: "providerAccountId",
  schema: Joi.object({
    providerId: Joi.string().required(),
    providerAccountId: Joi.string().required(),
    providerType: Joi.string().required(),
    userId: Joi.string().required(),
    refreshToken: Joi.string(),
    accessToken: Joi.string().required(),
    accessTokenExpires: Joi.number(),
  }),
  indexes: [{ hashKey: "userId", name: "AccountsUserIdIndex", type: "global" }],
});

interface Profile {
  name: string;
  email?: string;
  image: string;
  emailVerified?: boolean;
}

interface Session {
  id: string;
  expires: number;
  userId: string;
}

interface NextAuthSession {
  sessionToken: string;
  expires: number;
  userId: string;
}

const SessionStore = Omanyd.define<Session>({
  name: "sessions",
  hashKey: "id",
  schema: Joi.object({
    id: Omanyd.types.id(),
    userId: Joi.string().required(),
    expires: Joi.number().required(),
  }),
  indexes: [{ hashKey: "userId", name: "SessionUserIdIndex", type: "global" }],
});

const adapter: Adapter = {
  async getAdapter(options) {
    const log = (method: string, info: { [key: string]: any }) => {
      logger.info({ method, ...info });
    };

    const sessionLength = options.session?.maxAge ?? 30 * 24 * 60 * 60;

    return {
      async createUser(profile: Profile) {
        log("createUser", { profile });
        const { email, emailVerified, name, image } = profile;
        const savedUser = await UserStore.create({
          email: email ? email : undefined,
          emailVerified,
          name,
          image,
        });
        log("createUser", { savedUser });
        return savedUser;
      },

      async getUser(id: string) {
        log("getUser", { id });
        const user = await UserStore.getByHashKey(id);
        log("getUser", { user });
        return user;
      },
      async getUserByEmail(email: string) {
        log("getUserByEmail", { email });
        const user = await UserStore.getByIndex("UserEmailIndex", email);
        log("getUserByEmail", { user });
        return user;
      },
      async getUserByProviderAccountId(
        providerId: string,
        providerAccountId: string | number
      ) {
        log("getUserByProviderAccountId", { providerId, providerAccountId });
        const account = await AccountStore.getByHashAndRangeKey(
          providerId,
          providerAccountId.toString()
        );
        log("getUserByProviderAccountId", { account });
        if (!account) {
          return null;
        }
        const user = await UserStore.getByHashKey(account.userId);
        log("getUserByProviderAccountId", { user });
        return user;
      },
      async updateUser(user: User) {
        log("updateUser", { user });
        const updatedUser = await UserStore.put(user);
        return updatedUser;
      },

      async linkAccount(
        userId: string,
        providerId: string,
        providerType: string,
        providerAccountId: string | number,
        refreshToken: string | undefined,
        accessToken: string,
        accessTokenExpires: number
      ) {
        log("linkAccount", {
          userId,
          providerId,
          providerType,
          providerAccountId,
          refreshToken,
          accessToken,
          accessTokenExpires,
        });
        const account: Omit<Account, "id"> = {
          userId,
          providerId,
          providerAccountId: providerAccountId.toString(),
          providerType,
          accessToken,
          refreshToken,
        };
        if (accessTokenExpires) {
          account.accessTokenExpires = accessTokenExpires;
        }
        await AccountStore.create(account);
      },

      // Session
      async createSession(user: User): Promise<NextAuthSession> {
        log("createSession", { user });
        const session = await SessionStore.create({
          userId: user.id,
          expires: Math.floor(Date.now() / 1000) + sessionLength,
        });

        const nextAuthSession: NextAuthSession = {
          sessionToken: session.id,
          expires: session.expires * 1000,
          userId: session.userId,
        };

        log("createSession", { session, nextAuthSession });
        return nextAuthSession;
      },
      async getSession(sessionToken: string): Promise<NextAuthSession | null> {
        log("getSession", { sessionToken });
        const session = await SessionStore.getByHashKey(sessionToken);
        log("getSession", { session });
        if (!session) {
          return null;
        }
        if (session.expires <= Math.floor(Date.now() / 1000)) {
          return null;
        }
        const nextAuthSession: NextAuthSession = {
          sessionToken: session.id,
          expires: session.expires * 1000,
          userId: session.userId,
        };

        log("getSession", { nextAuthSession });
        return nextAuthSession;
      },
      async deleteSession() {
        log("deleteSession", {});
        // TODO: Should be handled by dynamodb TTL
      },
      async updateSession(nextAuthSession: NextAuthSession) {
        log("updateSession", { nextAuthSession });
        await SessionStore.put({
          id: nextAuthSession.sessionToken,
          expires: Math.floor(Date.now() / 1000) + sessionLength,
          userId: nextAuthSession.userId,
        });
      },
    };
  },
};

export const getAccount = async (
  userId: string,
  providerId: string
): Promise<Account | null> => {
  const account = await AccountStore.getByIndex("AccountsUserIdIndex", userId);
  if (account?.providerId !== providerId) {
    return null;
  }
  return account;
};

interface SeedData {
  email: string;
  name: string;
  image: string;
  accounts: {
    providerId: string;
    providerAccountId: string;
    accessToken: string;
  }[];
}

export const seedSession = async (details: SeedData) => {
  await Omanyd.createTables();
  const a = await adapter.getAdapter({} as any);
  const user = await a.createUser({
    email: details.email,
    name: details.name,
    image: details.image,
  });
  await Promise.all(
    details.accounts.map(async (account) => {
      await a.linkAccount(
        user.id,
        account.providerId,
        "oauth",
        account.providerAccountId,
        undefined as any,
        account.accessToken,
        Date.now()
      );
    })
  );
  const session = await a.createSession(user);
  return session.sessionToken;
};

export default adapter;
