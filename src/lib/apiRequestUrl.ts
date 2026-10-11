/** Only the configured API origin may receive a credential-bearing request. */
export function resolveApiRequestUrl(url: string, apiBase: string, frontendOrigin: string): string {
  const absoluteUrl = /^https?:\/\//i.test(url);
  const requestUrl = absoluteUrl ? url : apiBase + (url.startsWith('/') ? url : '/' + url);
  let target: URL;
  let approved: URL;
  try {
    target = new URL(requestUrl, frontendOrigin);
    approved = new URL(apiBase || frontendOrigin, frontendOrigin);
  } catch {
    throw new Error('Invalid API request URL');
  }
  if (!['http:', 'https:'].includes(target.protocol) || target.origin !== approved.origin) {
    throw new Error('Refusing to send credentials to an unapproved API origin');
  }
  return requestUrl;
}
