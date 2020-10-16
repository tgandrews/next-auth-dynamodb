import type { Adapter } from "next-auth/adapters";
import Omanyd from "omanyd";
import Joi from "joi";

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
    const sessionLength = options.session?.maxAge ?? 30 * 24 * 60 * 60;

    return {
      async createUser({ email, emailVerified, name, image }: Profile) {
        const savedUser = await UserStore.create({
          email,
          emailVerified,
          name,
          image,
        });
        return savedUser;
      },

      async getUser(id: string) {
        const user = await UserStore.getByHashKey(id);
        return user;
      },
      async getUserByEmail(email: string) {
        const user = await UserStore.getByIndex("UserEmailIndex", email);
        return user;
      },
      async getUserByProviderAccountId(
        providerId: string,
        providerAccountId: string
      ) {
        const account = await AccountStore.getByHashAndRangeKey(
          providerId,
          providerAccountId
        );
        if (!account) {
          return null;
        }
        const user = await UserStore.getByHashKey(account.userId);
        return user;
      },
      async updateUser(user: User) {
        const updatedUser = await UserStore.put(user);
        return updatedUser;
      },

      async linkAccount(
        userId: string,
        providerId: string,
        providerType: string,
        providerAccountId: string,
        refreshToken: string,
        accessToken: string,
        accessTokenExpires: number
      ) {
        await AccountStore.create({
          userId,
          providerId,
          providerAccountId,
          providerType,
          refreshToken,
          accessToken,
          accessTokenExpires,
        });
      },

      // Session
      async createSession(user: User): Promise<NextAuthSession> {
        const session = await SessionStore.create({
          userId: user.id,
          expires: Math.floor(Date.now() / 1000) + sessionLength,
        });

        return {
          sessionToken: session.id,
          expires: session.expires,
          userId: session.userId,
        };
      },
      async getSession(sessionToken: string): Promise<NextAuthSession | null> {
        const session = await SessionStore.getByHashKey(sessionToken);
        if (!session) {
          return null;
        }
        if (session.expires <= Math.floor(Date.now() / 1000)) {
          return null;
        }
        return {
          sessionToken: session.id,
          expires: session.expires,
          userId: session.userId,
        };
      },
      async deleteSession() {
        // TODO: Should be handled by dynamodb TTL
      },
      async updateSession(session: NextAuthSession) {
        await SessionStore.put({
          id: session.sessionToken,
          expires: Math.floor(Date.now() / 1000) + sessionLength,
          userId: session.userId,
        });
      },
    };
  },
};

export default adapter;
