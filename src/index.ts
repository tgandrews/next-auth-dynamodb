import type { Adapter } from "next-auth/adapters";
import Omanyd from "omanyd";
import Joi from "joi";
import pino from "pino";

const LOGGING_ENABLED = Boolean(process.env.NEXT_AUTH_DYNAMODB_DEBUG);
const logger = pino({ enabled: LOGGING_ENABLED });

interface User {
  id: string;
  name: string;
  email: string;
  image: string;
  emailVerified: boolean;
}

const UserStore = Omanyd.define<User>({
  name: "users",
  hashKey: "id",
  schema: {
    id: Omanyd.types.id(),
    email: Joi.string().required(),
    name: Joi.string(),
    image: Joi.string(),
    emailVerified: Joi.boolean(),
  },
  indexes: [{ hashKey: "email", name: "UserEmailIndex", type: "global" }],
});

interface Account {
  providerId: string;
  providerAccountId: string;
  userId: string;
  providerType: string;
  refreshToken?: string;
  accessToken: string;
  accessTokenExpires: number;
}

const AccountStore = Omanyd.define<Account>({
  name: "accounts",
  hashKey: "providerId",
  rangeKey: "providerAccountId",
  schema: {
    providerId: Joi.string().required(),
    providerAccountId: Joi.string().required(),
    providerType: Joi.string().required(),
    userId: Joi.string().required(),
    refreshToken: Joi.string(),
    accessToken: Joi.string().required(),
    accessTokenExpires: Joi.number().required(),
  },
});

interface Profile {
  name: string;
  email: string;
  image: string;
  emailVerified: boolean;
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
  schema: {
    id: Omanyd.types.id(),
    userId: Joi.string().required(),
    expires: Joi.number().required(),
  },
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
          email,
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
        refreshToken: string,
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
        await AccountStore.create({
          userId,
          providerId,
          providerAccountId: providerAccountId.toString(),
          providerType,
          refreshToken,
          accessToken,
          accessTokenExpires,
        });
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
          expires: session.expires,
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
          expires: session.expires,
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

export default adapter;
