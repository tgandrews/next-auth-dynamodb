import Omanyd from "omanyd";
import Joi from "joi";
import type { AppOptions } from "next-auth";

import nextAuthDynamodb, {
  getAccount,
  seedSession,
  userDefinition,
  User,
} from "./";

describe("next-auth-dynamodb", () => {
  const opts = {} as AppOptions;
  beforeEach(() => Omanyd.clearTables());

  describe("Adapter", () => {
    describe("user", () => {
      it("should create and return the user by email", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });
        const readUser = await adapter.getUserByEmail("foo@bar.com");
        expect(readUser).toStrictEqual(savedUser);
      });

      it("should not blow up if the user email verify state is unknown", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          name: "Foo Bar",
          image: "foo.png",
        });
        const readUser = await adapter.getUserByEmail("foo@bar.com");
        expect(readUser).toStrictEqual(savedUser);
        expect(readUser.emailVerified).toBeUndefined();
      });

      it("should return the created user by id", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });
        const readUser = await adapter.getUser(savedUser.id);
        expect(readUser).toStrictEqual(savedUser);
      });

      it("should not blow up if the user's email address is null", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: null,
          name: "Null Email",
          image: "foo.png",
        });
        const readUser = await adapter.getUser(savedUser.id);
        expect(readUser).toStrictEqual(savedUser);
      });

      it("should be able to link a user to the a provider and return the user", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });

        const providerId = `providerId-${Date.now()}`;
        const providerAccountId = `providerAccountId-${Date.now()}`;

        await adapter.linkAccount(
          savedUser.id,
          providerId,
          "providerType",
          providerAccountId,
          "refreshToken",
          "accessToken",
          Date.now()
        );

        const readUser = await adapter.getUserByProviderAccountId(
          providerId,
          providerAccountId
        );

        expect(readUser).toStrictEqual(savedUser);
      });

      it("should return null if no account given the provider and providerId", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const providerId = `providerId-${Date.now()}`;
        const providerAccountId = `providerAccountId-${Date.now()}`;

        const readUser = await adapter.getUserByProviderAccountId(
          providerId,
          providerAccountId
        );

        expect(readUser).toBeNull();
      });

      it("should not fail to link when there is no access token expiry date", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });

        const providerId = `providerId-${Date.now()}`;
        const providerAccountId = `providerAccountId-${Date.now()}`;

        await adapter.linkAccount(
          savedUser.id,
          providerId,
          "providerType",
          providerAccountId,
          "refreshToken",
          "accessToken",
          null as any
        );

        const readUser = await adapter.getUserByProviderAccountId(
          providerId,
          providerAccountId
        );

        expect(readUser).toStrictEqual(savedUser);
      });

      it("should not fail to link when there is no access refresh token", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });

        const providerId = `providerId-${Date.now()}`;
        const providerAccountId = `providerAccountId-${Date.now()}`;

        await adapter.linkAccount(
          savedUser.id,
          providerId,
          "providerType",
          providerAccountId,
          undefined as any,
          "accessToken",
          Date.now()
        );

        const readUser = await adapter.getUserByProviderAccountId(
          providerId,
          providerAccountId
        );

        expect(readUser).toStrictEqual(savedUser);
      });

      it("should not blow up if a provider uses numeric account ids", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });

        const providerId = `providerId-${Date.now()}`;
        const providerAccountId = Date.now();

        await adapter.linkAccount(
          savedUser.id,
          providerId,
          "providerType",
          providerAccountId as any, // Hack as the @types/next-auth is not correct
          "refreshToken",
          "accessToken",
          Date.now()
        );

        const readUser = await adapter.getUserByProviderAccountId(
          providerId,
          providerAccountId as any
        );

        expect(readUser).toStrictEqual(savedUser);
      });

      it("should be able to update the user", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });
        await adapter.updateUser({
          ...savedUser,
          image: "bar.gif",
        });
        const readUser = await adapter.getUser(savedUser.id);
        expect(readUser).toStrictEqual({ ...savedUser, image: "bar.gif" });
      });
    });

    describe("session", () => {
      it("should be able to create a session for a user", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });
        const session = await adapter.createSession(savedUser);

        expect(session).toEqual({
          sessionToken: expect.any(String),
          expires: expect.any(Number),
          userId: savedUser.id,
        });
        expect(session.expires).toBeGreaterThanOrEqual(
          Date.now() + (30 * 24 * 60 * 60 - 2) * 1000
        );
      });

      it("should be able to retrieve a session given a session token", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });
        const savedSession = await adapter.createSession(savedUser);
        const readSession = await adapter.getSession(savedSession.sessionToken);

        expect(readSession).toStrictEqual(savedSession);
      });

      it("should return null if the session does not exist", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const readSession = await adapter.getSession("foobar");

        expect(readSession).toBeNull();
      });

      it("should not be able to retrieve an expired session", async () => {
        const adapter = await nextAuthDynamodb.getAdapter({
          ...opts,
          session: { maxAge: 0 },
        });
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });
        const savedSession = await adapter.createSession(savedUser);
        const readSession = await adapter.getSession(savedSession.sessionToken);

        expect(readSession).toBeNull();
      });

      it("should update session expiry", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        const savedUser = await adapter.createUser({
          email: "foo@bar.com",
          emailVerified: false,
          name: "Foo Bar",
          image: "foo.png",
        });
        const savedSession = await adapter.createSession(savedUser);
        await new Promise((res) => setTimeout(res, 1000));
        await adapter.updateSession(savedSession);
        const updatedSession = await adapter.getSession(
          savedSession.sessionToken
        );
        expect(updatedSession.expires).toBeGreaterThan(savedSession.expires);
      });

      it("should should resolve delete calls", async () => {
        const adapter = await nextAuthDynamodb.getAdapter(opts);
        await expect(adapter.deleteSession("")).resolves.toBeUndefined();
      });
    });
  });

  describe("getAccount", () => {
    it("should return the linked accounts for the user", async () => {
      const adapter = await nextAuthDynamodb.getAdapter(opts);
      const savedUser = await adapter.createUser({
        email: "foo@bar.com",
        emailVerified: false,
        name: "Foo Bar",
        image: "foo.png",
      });

      const providerId = `providerId-${Date.now()}`;
      const providerAccountId = `providerAccountId-${Date.now()}`;

      await adapter.linkAccount(
        savedUser.id,
        providerId,
        "providerType",
        providerAccountId,
        "refreshToken",
        "accessToken",
        Date.now()
      );

      const account = await getAccount(savedUser.id, providerId);
      expect(account).toMatchObject({
        providerId,
        providerAccountId,
        accessToken: "accessToken",
        refreshToken: "refreshToken",
      });
    });

    it("should return null if the wrong account found", async () => {
      const adapter = await nextAuthDynamodb.getAdapter(opts);
      const savedUser = await adapter.createUser({
        email: "foo@bar.com",
        emailVerified: false,
        name: "Foo Bar",
        image: "foo.png",
      });

      const providerId = `providerId-${Date.now()}`;
      const providerAccountId = `providerAccountId-${Date.now()}`;

      await adapter.linkAccount(
        savedUser.id,
        providerId,
        "providerType",
        providerAccountId,
        "refreshToken",
        "accessToken",
        Date.now()
      );

      const account = await getAccount(savedUser.id, "wrong id");
      expect(account).toBeNull();
    });

    it("should return null if account not found", async () => {
      const adapter = await nextAuthDynamodb.getAdapter(opts);
      const savedUser = await adapter.createUser({
        email: "foo@bar.com",
        emailVerified: false,
        name: "Foo Bar",
        image: "foo.png",
      });

      const account = await getAccount(savedUser.id, "something");

      expect(account).toBeNull();
    });
  });

  describe("seedSession", () => {
    it("should allow a user to be created with an account and session and pass back a session id", async () => {
      const adapter = await nextAuthDynamodb.getAdapter(opts);
      const sessionToken = await seedSession({
        email: "foo@bar.com",
        name: "Some user",
        image: "profile.png",
        accounts: [
          {
            providerId: "someProvider",
            providerAccountId: "someProviderAccountId",
            accessToken: "my access token",
          },
        ],
      });

      const session = await adapter.getSession(sessionToken);
      const sessionUser = await adapter.getUser(session.userId);
      const providerUser = await adapter.getUserByProviderAccountId(
        "someProvider",
        "someProviderAccountId"
      );

      expect(sessionUser).toStrictEqual(providerUser);
    });
  });

  describe("extending user", () => {
    it("should be possible to build a user space extension of user", async () => {
      interface ExtendedUser extends User {
        extras: string[];
      }

      const ExtendedUserStore = Omanyd.define<ExtendedUser>({
        ...userDefinition,
        schema: userDefinition.schema.keys({
          extras: Joi.array().items(Joi.string().required()).default([]),
        }),
        allowNameClash: true,
      });

      const sessionToken = await seedSession({
        email: "foo@bar.com",
        name: "Some user",
        image: "profile.png",
        accounts: [
          {
            providerId: "someProvider",
            providerAccountId: "someProviderAccountId",
            accessToken: "my access token",
          },
        ],
      });

      const adapter = await nextAuthDynamodb.getAdapter(opts);
      const session = await adapter.getSession(sessionToken);
      const sessionUser = await adapter.getUser(session.userId);

      const extendedUser = await ExtendedUserStore.getByHashKey(sessionUser.id);
      expect(extendedUser).toStrictEqual({
        ...sessionUser,
        extras: [],
      });
    });

    it("should be possible to add fields to the user", async () => {
      interface ExtendedUser extends User {
        extras: string[];
      }

      const ExtendedUserStore = Omanyd.define<ExtendedUser>({
        ...userDefinition,
        schema: userDefinition.schema.keys({
          extras: Joi.array().items(Joi.string().required()).default([]),
        }),
        allowNameClash: true,
      });

      const sessionToken = await seedSession({
        email: "foo@bar.com",
        name: "Some user",
        image: "profile.png",
        accounts: [
          {
            providerId: "someProvider",
            providerAccountId: "someProviderAccountId",
            accessToken: "my access token",
          },
        ],
      });

      const adapter = await nextAuthDynamodb.getAdapter(opts);
      const session = await adapter.getSession(sessionToken);
      const sessionUser = await adapter.getUser(session.userId);

      await ExtendedUserStore.put({
        ...sessionUser,
        extras: ["hello", "world"],
      });

      const sessionUser2 = await adapter.getUser(session.userId);
      const extendedUser = await ExtendedUserStore.getByHashKey(sessionUser.id);

      expect(sessionUser2.extras).toStrictEqual(["hello", "world"]);
      expect(extendedUser).toStrictEqual({
        ...sessionUser,
        extras: ["hello", "world"],
      });
    });
  });
});
