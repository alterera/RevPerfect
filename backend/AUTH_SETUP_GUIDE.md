# Email Authentication Setup Guide

This guide will help you set up OAuth authentication for your personal Outlook email account to work with the email watcher service.

## Problem Overview

Personal Microsoft accounts (Outlook.com, Hotmail.com, etc.) require **delegated permissions** with user authentication, not application-only authentication. This means we need to:

1. Obtain user consent
2. Get an authorization code
3. Exchange it for access and refresh tokens
4. Use refresh tokens to get new access tokens automatically

## Prerequisites

1. Your app must be registered in Azure Portal with:
   - **Redirect URI**: `http://localhost:3000/auth/callback`
   - **API Permissions**: `Mail.Read`, `Mail.ReadWrite`, `offline_access` (delegated permissions)
   - **Platform**: Web
   - **Client Secret**: Generated and saved

2. Update your `.env` file with the correct values:

```env
MS_GRAPH_CLIENT_ID="your-client-id"
MS_GRAPH_CLIENT_SECRET="your-client-secret"
MS_GRAPH_TENANT_ID="consumers"
REDIRECT_URI="http://localhost:3000/auth/callback"
MONITORED_EMAIL="youremail@outlook.com"
```

**Important**: Use `MS_GRAPH_TENANT_ID="consumers"` for personal Microsoft accounts (Outlook.com, Hotmail.com, Live.com)

## Step-by-Step Setup

### Step 1: Verify Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Select your app or create a new one
4. Under **Authentication**:
   - Platform type: **Web**
   - Redirect URI: `http://localhost:3000/auth/callback`
   - Supported account types: **Personal Microsoft accounts only** OR **Accounts in any organizational directory and personal Microsoft accounts**

5. Under **API Permissions**:
   - Add **Microsoft Graph** delegated permissions:
     - `Mail.Read`
     - `Mail.ReadWrite`
     - `offline_access`
   - Click "Grant admin consent" if available (optional for personal accounts)

6. Under **Certificates & secrets**:
   - Create a new client secret
   - Copy the secret value (you can only see it once!)
   - Save it as `MS_GRAPH_CLIENT_SECRET` in your `.env` file

### Step 2: Run the Authentication Setup Script

This is a **one-time setup** to obtain your initial refresh token.

1. Make sure your `.env` file is configured correctly
2. Run the authentication setup script:

```bash
npm run setup-auth
# or
npx tsx src/setup-auth.ts
```

3. Open your browser and navigate to: `http://localhost:3000`

4. Click "Start Authentication"

5. Sign in with your Outlook account (the one specified in `MONITORED_EMAIL`)

6. Grant the requested permissions

7. You'll be redirected back with a success message

8. A `token.json` file will be created in your project root with your refresh token

9. Stop the authentication server (Ctrl+C)

### Step 3: Verify Token File

Check that `token.json` exists in your project root:

```bash
cat token.json
```

It should look like this:

```json
{
  "access_token": "EwB...",
  "refresh_token": "M.C5...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "Mail.Read Mail.ReadWrite offline_access"
}
```

**Important**: Keep this file secure! Add it to `.gitignore` to prevent committing it.

### Step 4: Run Your Email Watcher

Now you can run your email watcher service:

```bash
npm run dev
# or
npm start
```

The service will automatically:
- Use the refresh token to get new access tokens
- Update `token.json` with fresh tokens
- Monitor your inbox for new emails

## How It Works

### Token Flow

1. **Initial Setup** (one-time):
   - User logs in via browser
   - Authorization code is received
   - Code is exchanged for access + refresh tokens
   - Tokens are saved to `token.json`

2. **Automatic Refresh** (ongoing):
   - When email service needs access, it calls `tokenService.getAccessToken()`
   - Token service reads refresh token from `token.json`
   - Calls Microsoft's token endpoint to get a new access token
   - Saves updated tokens back to `token.json`
   - Returns fresh access token to email service

3. **Email Operations**:
   - Microsoft Graph client uses the token service
   - All API calls use `/me` endpoint (user context)
   - Works with delegated permissions

## Troubleshooting

### Error: "AADSTS70002: The provided request must include a 'client_secret' input parameter"

**Solution**: Make sure `MS_GRAPH_TENANT_ID="consumers"` in your `.env` file (not "common")

### Error: "token.json not found"

**Solution**: Run the authentication setup script first (Step 2)

### Error: "invalid_grant" when refreshing token

**Solutions**:
- Your refresh token may have expired (they last 90 days by default)
- Run the authentication setup again to get a new refresh token
- Make sure you're using the correct `MONITORED_EMAIL`

### Error: "Access Denied" or "Insufficient Privileges"

**Solutions**:
- Check that you've added delegated permissions (not application permissions)
- Make sure you granted consent during login
- Verify permissions in Azure Portal: `Mail.Read`, `Mail.ReadWrite`, `offline_access`

### Error: "The reply URL specified in the request does not match"

**Solution**: Ensure your Azure app registration has exactly: `http://localhost:3000/auth/callback`

## Key Differences from Previous Implementation

| Aspect | Old (App-only) | New (Delegated) |
|--------|----------------|-----------------|
| Authentication | `ClientSecretCredential` | OAuth refresh token flow |
| Tenant | `common` | `consumers` |
| API Endpoints | `/users/{email}/...` | `/me/...` |
| Permissions | Application | Delegated |
| Setup | Just env vars | One-time OAuth flow |

## Security Notes

1. **token.json** contains sensitive data - add it to `.gitignore`
2. Keep your client secret secure
3. Refresh tokens can be revoked from [Microsoft Account Security](https://account.live.com/consent/Manage)
4. Tokens expire after 90 days of inactivity - you'll need to re-authenticate

## Adding to Package.json

Add this script to your `package.json`:

```json
{
  "scripts": {
    "setup-auth": "tsx src/setup-auth.ts"
  }
}
```

## Need to Re-authenticate?

If your tokens expire or you need to re-authenticate:

1. Delete `token.json`
2. Run `npm run setup-auth` again
3. Complete the login flow

That's it! You're all set. 🎉

