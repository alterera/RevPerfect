# Quick Start - Email Authentication Setup

## TL;DR - Getting Started

Follow these steps to get your email authentication working:

### 1. Update Your .env File

```env
MS_GRAPH_CLIENT_ID="19663965-ce8c-43b7-b7e4-f22b99e2ddbb"
MS_GRAPH_CLIENT_SECRET="J.X8Q~Wd3PWcDSAuenUfoEqwy2dni2HpEQCfwchp"
MS_GRAPH_TENANT_ID="consumers"
REDIRECT_URI="http://localhost:3000/auth/callback"
MONITORED_EMAIL="iamasifakhtar1@outlook.com"
```

**Important**: Change `MS_GRAPH_TENANT_ID` from `"common"` to `"consumers"` for personal Outlook accounts.

### 2. Install New Dependencies

```bash
npm install
```

### 3. Run One-Time Authentication Setup

```bash
npm run setup-auth
```

This will:
- Start a local web server on port 3000
- Open a browser window for you to log in
- Save your tokens to `token.json`

### 4. Complete the Login Flow

1. Browser opens to `http://localhost:3000`
2. Click "Start Authentication"
3. Log in with your Outlook account (`iamasifakhtar1@outlook.com`)
4. Grant permissions
5. Wait for success message
6. Press Ctrl+C to stop the server

### 5. Verify Token File Created

```bash
ls -la token.json
```

You should see a `token.json` file in your project root.

### 6. Start Your Email Watcher

```bash
npm run dev
```

Your email watcher is now ready! It will automatically:
- Refresh access tokens as needed
- Monitor your inbox for new emails
- Process attachments

## What Changed?

### Old Approach (Not Working)
- Used `ClientSecretCredential` from `@azure/identity`
- Application-only authentication
- Required work/school account
- Used `/users/{email}/messages` endpoints

### New Approach (Working)
- Uses OAuth 2.0 refresh token flow
- Delegated permissions (user context)
- Works with personal Outlook accounts
- Uses `/me/messages` endpoints
- Tenant ID: `consumers` instead of `common`

## Troubleshooting

### "token.json not found"
→ Run `npm run setup-auth` first

### "invalid_client" or "AADSTS70002"
→ Make sure `MS_GRAPH_TENANT_ID="consumers"` in your .env

### "Access Denied"
→ Check Azure app permissions: `Mail.Read`, `Mail.ReadWrite`, `offline_access` (delegated)

### Need to re-authenticate?
```bash
rm token.json
npm run setup-auth
```

## Files Added/Modified

### New Files
- `src/services/token.service.ts` - Manages refresh tokens
- `src/setup-auth.ts` - One-time auth setup script
- `AUTH_SETUP_GUIDE.md` - Detailed setup guide
- `token.json` - Your refresh token (auto-generated, git-ignored)

### Modified Files
- `src/services/email.service.ts` - Uses token-based auth, `/me` endpoints
- `src/config/index.ts` - Added REDIRECT_URI config
- `env.example` - Updated with new variables
- `.gitignore` - Added token.json
- `package.json` - Added setup-auth script, axios, express

## Security Note

🔒 **token.json** contains sensitive authentication data. It's already added to `.gitignore` to prevent committing it to git.

## Next Steps

Once authentication is working:
1. Your email watcher will run automatically
2. Tokens refresh automatically every hour
3. Refresh token lasts 90 days (re-authenticate when it expires)

For detailed information, see `AUTH_SETUP_GUIDE.md`.

