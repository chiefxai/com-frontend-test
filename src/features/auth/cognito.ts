import { Amplify } from 'aws-amplify';
import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signInWithRedirect,
  signOut,
} from 'aws-amplify/auth';

const config = {
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  region: import.meta.env.VITE_COGNITO_REGION ?? '',
  domain: import.meta.env.VITE_COGNITO_DOMAIN ?? '',
  redirectSignIn: import.meta.env.VITE_COGNITO_REDIRECT_SIGN_IN ?? window.location.origin,
  redirectSignOut: import.meta.env.VITE_COGNITO_REDIRECT_SIGN_OUT ?? window.location.origin,
};

let configured = false;

export function isCognitoConfigured() {
  return Boolean(config.userPoolId && config.userPoolClientId && config.region && config.domain);
}

export function configureCognito() {
  if (configured || !isCognitoConfigured()) return;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: {
          oauth: {
            domain: String(config.domain).trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
            // Request the OIDC profile scope so Cognito can return profile
            // claims such as name/given_name/family_name in the ID token.
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [String(config.redirectSignIn).trim()],
            redirectSignOut: [String(config.redirectSignOut).trim()],
            responseType: 'code',
          },
        },
      },
    },
  });

  configured = true;
}

export async function signInWithCognito(provider?: 'Google' | 'Facebook' | 'Amazon' | 'Apple') {
  configureCognito();
  if (provider) {
    await signInWithRedirect({ provider });
    return;
  }
  await signInWithRedirect();
}

export async function getCognitoToken() {
  configureCognito();
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString() ?? session.tokens?.accessToken?.toString() ?? '';
}

export async function getCognitoUser() {
  configureCognito();
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export async function getCognitoProfile() {
  configureCognito();

  try {
    const attributes = await fetchUserAttributes();
    return Object.fromEntries(
      Object.entries(attributes).filter(([, value]) => value != null && value !== ''),
    );
  } catch {
    return {};
  }
}

export async function signOutCognito() {
  configureCognito();

  sessionStorage.setItem('cognito_logout_requested', '1');
  sessionStorage.removeItem('cognito_signin_attempted');

  try {
    await signOut({ global: true });
  } catch (err) {
    console.warn('Cognito global sign-out failed; continuing with Hosted UI logout:', err);
  }

  // Cognito managed logout requires the full HTTPS domain.
  // Normalize it exactly like the OAuth configuration above.
  const normalizedDomain = String(config.domain)
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const logoutUri = String(config.redirectSignOut).trim();
  const hostedLogoutUrl =
    `https://${normalizedDomain}/logout?client_id=${encodeURIComponent(config.userPoolClientId)}`
    + `&logout_uri=${encodeURIComponent(logoutUri)}`;

  window.location.replace(hostedLogoutUrl);
}
