/**
 * The public origin, and the one redirect URI built from it.
 *
 * Both real providers need it and neither may guess it: openid-client compares the whole
 * callback URL, and Airtable matches the registered redirect URI exactly. Behind a proxy
 * the request's own host is not the public one, so APP_URL is the only source.
 */
export function appUrl(): string {
  const v = process.env.APP_URL?.trim();
  if (!v) throw new Error("APP_URL is required for sign-in (for example https://foundry.example.com). It builds the redirect URI.");
  return v.replace(/\/+$/, "");
}

export function redirectUri(): string {
  return `${appUrl()}/auth/callback`;
}
