/**
 * Who the Users table lets in, matched on the Airtable user ID.
 *
 * The fixture is the smallest slice of Data the matcher reads, built by hand rather than
 * from a snapshot: these tests must say something about the rule, not about the sync.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { matchUserById } from "./index";
import type { Data, User } from "../snapshot";

function user(fields: Partial<User> & { id: string }): User {
  return { createdTime: "2026-01-01T00:00:00.000Z", admin: false, status: "Active", ...fields } as User;
}

const ACTIVE = user({ id: "recAda", userId: "usr001", email: "ada@airtable.com" });
const DEACTIVATED = user({ id: "recBell", userId: "usr002", email: "bell@airtable.com", status: "Deactivated" });
// Outside the org domains in foundry.config.ts, which is what "external" means for scope.
const EXTERNAL = user({ id: "recCarl", userId: "usr003", email: "carl@walmart.com" });

function fixture(users: User[]): Pick<Data, "users" | "userByEmail"> {
  return {
    users,
    userByEmail: new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u])),
  };
}

const data = fixture([ACTIVE, DEACTIVATED, EXTERNAL]);

describe("matchUserById", () => {
  beforeEach(() => {
    delete process.env.AUTH_ALLOW_EXTERNAL;
    delete process.env.AUTH_MATCH_EMAIL_FALLBACK;
  });

  it("admits an active member and hands back their row", () => {
    expect(matchUserById(data, "usr001")).toEqual({ kind: "user", user: ACTIVE });
  });

  it("refuses a deactivated member", () => {
    expect(matchUserById(data, "usr002")).toEqual({ kind: "denied", reason: "inactive" });
  });

  it("refuses an ID that is not in the table", () => {
    expect(matchUserById(data, "usr404")).toEqual({ kind: "denied", reason: "not-found" });
  });

  it("refuses an unusable ID rather than falling through to the first row", () => {
    expect(matchUserById(data, undefined)).toEqual({ kind: "denied", reason: "not-found" });
    expect(matchUserById(data, "  ")).toEqual({ kind: "denied", reason: "not-found" });
  });

  it("refuses an external account by default", () => {
    expect(matchUserById(data, "usr003")).toEqual({ kind: "denied", reason: "external" });
  });

  it("admits an external account when the deployment allows it", () => {
    process.env.AUTH_ALLOW_EXTERNAL = "1";
    expect(matchUserById(data, "usr003")).toEqual({ kind: "user", user: EXTERNAL });
  });

  it("ignores the email unless the fallback is switched on", () => {
    expect(matchUserById(data, "usrUnknown", "ada@airtable.com")).toEqual({ kind: "denied", reason: "not-found" });
    process.env.AUTH_MATCH_EMAIL_FALLBACK = "1";
    expect(matchUserById(data, "usrUnknown", "ADA@airtable.com")).toEqual({ kind: "user", user: ACTIVE });
  });

  it("applies the same three checks to an email fallback match", () => {
    process.env.AUTH_MATCH_EMAIL_FALLBACK = "1";
    expect(matchUserById(data, "usrUnknown", "bell@airtable.com")).toEqual({ kind: "denied", reason: "inactive" });
    expect(matchUserById(data, "usrUnknown", "carl@walmart.com")).toEqual({ kind: "denied", reason: "external" });
  });
});
