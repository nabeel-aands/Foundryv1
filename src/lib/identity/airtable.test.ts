/**
 * The Airtable callback, with the token endpoint and whoami stubbed. No network: `fetch`
 * is injected, and a test that reached airtable.com would be a test of Airtable.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildAuthorizationRequest, completeCallback, type FetchLike } from "./airtable";

const REDIRECT = "http://127.0.0.1:3000/auth/callback";
const STATE = "state-from-the-login-cookie";
const VERIFIER = "verifier-from-the-login-cookie";

type Call = { url: string; init?: RequestInit };

/** A fetch that answers the two URLs this file calls and records what it was asked. */
function stub(answers: { token?: Response | (() => Response); whoami?: Response | (() => Response) }): {
  fetch: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  const pick = (r: Response | (() => Response) | undefined, fallback: Response) => (typeof r === "function" ? r() : r ?? fallback);
  const fetch: FetchLike = async (input, init) => {
    const url = input.toString();
    calls.push({ url, init });
    if (url.startsWith("https://airtable.com/oauth2/v1/token")) {
      return pick(answers.token, Response.json({ access_token: "acc-token", refresh_token: "ref-token", expires_in: 3600 }));
    }
    if (url.startsWith("https://api.airtable.com/v0/meta/whoami")) {
      return pick(answers.whoami, Response.json({ id: "usr001", email: "ada@airtable.com", scopes: ["user.email:read"] }));
    }
    throw new Error(`unexpected request to ${url}`);
  };
  return { fetch, calls };
}

function callbackUrl(params: Record<string, string>): URL {
  const u = new URL(REDIRECT);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

beforeEach(() => {
  process.env.APP_URL = "http://127.0.0.1:3000";
  process.env.AIRTABLE_OAUTH_CLIENT_ID = "client-id";
  process.env.AIRTABLE_OAUTH_CLIENT_SECRET = "client-secret";
});

describe("buildAuthorizationRequest", () => {
  it("asks for a code with S256 PKCE, the identity scope and a state", () => {
    const req = buildAuthorizationRequest();
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe("https://airtable.com/oauth2/v1/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("scope")).toBe("user.email:read");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(req.state);
    // The verifier stays with Foundry; only its hash goes to Airtable.
    expect(url.searchParams.get("code_challenge")).not.toBe(req.codeVerifier);
    expect(req.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it("gives every attempt its own state and verifier", () => {
    const a = buildAuthorizationRequest();
    const b = buildAuthorizationRequest();
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe("completeCallback", () => {
  it("exchanges the code with Basic auth and PKCE, then returns only the identity", async () => {
    const { fetch, calls } = stub({});
    const claims = await completeCallback(callbackUrl({ code: "the-code", state: STATE }), VERIFIER, STATE, { fetch });

    expect(claims).toEqual({ airtableUserId: "usr001", email: "ada@airtable.com" });
    expect(calls).toHaveLength(2);

    const token = calls[0];
    expect(token.init?.method).toBe("POST");
    expect(header(token.init, "authorization")).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    const body = new URLSearchParams(String(token.init?.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
    });

    expect(calls[1].url).toBe("https://api.airtable.com/v0/meta/whoami");
    expect(header(calls[1].init, "authorization")).toBe("Bearer acc-token");
  });

  it("names a public integration in the body when it has no secret", async () => {
    delete process.env.AIRTABLE_OAUTH_CLIENT_SECRET;
    const { fetch, calls } = stub({});
    await completeCallback(callbackUrl({ code: "the-code", state: STATE }), VERIFIER, STATE, { fetch });
    expect(header(calls[0].init, "authorization")).toBeUndefined();
    expect(new URLSearchParams(String(calls[0].init?.body)).get("client_id")).toBe("client-id");
  });

  it("accepts an identity without an email, which is whoami without the scope", async () => {
    const { fetch } = stub({ whoami: Response.json({ id: "usr002" }) });
    await expect(completeCallback(callbackUrl({ code: "c", state: STATE }), VERIFIER, STATE, { fetch })).resolves.toEqual({
      airtableUserId: "usr002",
      email: undefined,
    });
  });

  it("rejects a tampered state before calling anything", async () => {
    const { fetch, calls } = stub({});
    await expect(completeCallback(callbackUrl({ code: "c", state: `${STATE}x` }), VERIFIER, STATE, { fetch })).rejects.toThrow(/state mismatch/);
    expect(calls).toHaveLength(0);
  });

  it("rejects a callback with no state, and one the browser never started", async () => {
    const { fetch, calls } = stub({});
    await expect(completeCallback(callbackUrl({ code: "c" }), VERIFIER, STATE, { fetch })).rejects.toThrow(/state mismatch/);
    await expect(completeCallback(callbackUrl({ code: "c", state: STATE }), VERIFIER, undefined, { fetch })).rejects.toThrow(/state mismatch/);
    expect(calls).toHaveLength(0);
  });

  it("surfaces a refusal from Airtable's consent screen", async () => {
    const { fetch, calls } = stub({});
    const url = callbackUrl({ error: "access_denied", error_description: "the user said no", state: STATE });
    await expect(completeCallback(url, VERIFIER, STATE, { fetch })).rejects.toThrow(/access_denied/);
    expect(calls).toHaveLength(0);
  });

  it("fails loudly on a token error and never calls whoami", async () => {
    const { fetch, calls } = stub({ token: () => new Response('{"error":"invalid_grant"}', { status: 400 }) });
    await expect(completeCallback(callbackUrl({ code: "c", state: STATE }), VERIFIER, STATE, { fetch })).rejects.toThrow(/token exchange failed \(400\).*invalid_grant/);
    expect(calls).toHaveLength(1);
  });

  it("fails when the token response carries no access token", async () => {
    const { fetch } = stub({ token: () => Response.json({ token_type: "Bearer" }) });
    await expect(completeCallback(callbackUrl({ code: "c", state: STATE }), VERIFIER, STATE, { fetch })).rejects.toThrow(/no access token/);
  });

  it("fails when whoami refuses the token", async () => {
    const { fetch } = stub({ whoami: () => new Response("nope", { status: 401 }) });
    await expect(completeCallback(callbackUrl({ code: "c", state: STATE }), VERIFIER, STATE, { fetch })).rejects.toThrow(/whoami failed \(401\)/);
  });
});
