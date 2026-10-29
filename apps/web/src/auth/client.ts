import { createAuthClient } from 'better-auth/react';

// Relative requests use the site's own origin; the server validates its configured origin.
export const authClient = createAuthClient();
