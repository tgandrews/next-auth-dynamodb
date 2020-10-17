import Omanyd from "omanyd";
import type { AppOptions } from "next-auth";

import nextAuthDynamodb from "./";

describe("next-auth-dynamodb", () => {
  const opts = {} as AppOptions;

  beforeEach(() => Omanyd.clearTables());

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
        Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 - 1
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
  });
});
