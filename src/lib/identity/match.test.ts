/**
 * Who the Users table lets in, matched on the verified email the identity provider returns.
 *
 * The fixture is the smallest slice of Data the matcher reads, built by hand rather than
 * from a snapshot: these tests must say something about the rule, not about the sync.
 */
import { afterEach, describe, expect, it } from "vitest";
import { matchUser } from "./index";
import type { Data, User } from "../snapshot";

function user(fields: Partial<User> & { id: string }): User {
  return { createdTime: "2026-01-01T00:00:00.000Z", admin: false, status: "Active", ...fields } as User;
}

const ACTIVE = user({ id: "recAda", email: "ada@airtable.com" });
const DEACTIVATED = user({ id: "recBell", email: "bell@airtable.com", status: "Deactivated" });
// Outside the org domains in foundry.config.ts, which is what "external" means for scope.
const EXTERNAL = user({ id: "recCarl", email: "carl@walmart.com" });

function fixture(users: User[]): Pick<Data, "userByEmail"> {
  return { userByEmail: new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u])) };
}

const data = fixture([ACTIVE, DEACTIVATED, EXTERNAL]);

afterEach(() => {
  delete process.env.AUTH_ALLOW_EXTERNAL;
});

describe("matchUser", () => {
  it("admits an active member and hands back their row", () => {
    expect(matchUser(data, "ada@airtable.com", true)).toEqual({ kind: "user", user: ACTIVE });
  });

  it("ignores the case of the email", () => {
    expect(matchUser(data, "  ADA@Airtable.com ", true)).toEqual({ kind: "user", user: ACTIVE });
  });

  it("admits when the provider does not say whether the email is verified", () => {
    expect(matchUser(data, "ada@airtable.com", undefined)).toEqual({ kind: "user", user: ACTIVE });
  });

  it("refuses an email the provider marks unverified", () => {
    expect(matchUser(data, "ada@airtable.com", false)).toEqual({ kind: "denied", reason: "unverified-email" });
  });

  it("refuses a deactivated member", () => {
    expect(matchUser(data, "bell@airtable.com", true)).toEqual({ kind: "denied", reason: "inactive" });
  });

  it("refuses an email that is not in the table", () => {
    expect(matchUser(data, "nobody@airtable.com", true)).toEqual({ kind: "denied", reason: "not-found" });
  });

  it("refuses a missing or blank email rather than falling through to the first row", () => {
    expect(matchUser(data, undefined, true)).toEqual({ kind: "denied", reason: "not-found" });
    expect(matchUser(data, "   ", true)).toEqual({ kind: "denied", reason: "not-found" });
  });

  it("refuses an external account by default", () => {
    expect(matchUser(data, "carl@walmart.com", true)).toEqual({ kind: "denied", reason: "external" });
  });

  it("admits an external account when the deployment allows it", () => {
    process.env.AUTH_ALLOW_EXTERNAL = "1";
    expect(matchUser(data, "carl@walmart.com", true)).toEqual({ kind: "user", user: EXTERNAL });
  });
});
