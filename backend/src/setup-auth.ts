import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { tokenService } from './services/token.service.js';

dotenv.config();

const app = express();
const PORT = 3000;

const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback';
const SCOPES = 'offline_access Mail.Read Mail.ReadWrite';

/**
 * One-time authentication setup script
 * This script helps you obtain the initial refresh token
 */

// Step 1: Redirect user to Microsoft login
app.get('/auth/login', (_req, res) => {
  const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_mode=query&scope=${encodeURIComponent(SCOPES)}`;

  console.log('\n🔐 Opening Microsoft login page...');
  console.log('Please login with your Outlook account:', process.env.MONITORED_EMAIL);
  
  res.redirect(authUrl);
});

// Step 2: Handle callback and exchange code for tokens
app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('❌ Authentication error:', error);
    res.send(`<h1>Authentication failed</h1><p>Error: ${error}</p>`);
    return;
  }

  if (!code) {
    res.send('<h1>No authorization code received</h1>');
    return;
  }

  try {
    console.log('\n✅ Authorization code received');
    console.log('⚙️  Exchanging code for tokens...');

    // Exchange authorization code for tokens
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID || '');
    params.append('scope', SCOPES);
    params.append('code', code as string);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('grant_type', 'authorization_code');
    params.append('client_secret', CLIENT_SECRET || '');

    const tokenUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';

    const response = await axios.post(tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokens = response.data;

    // Save tokens to file
    tokenService.saveTokens(tokens);

    console.log('\n✅ Authentication successful!');
    console.log('✅ Tokens saved to token.json');
    console.log('\n🎉 Setup complete! You can now run your email watcher job.');
    console.log('\nYou can close this window and stop the server (Ctrl+C)');

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            .success {
              color: #28a745;
              font-size: 48px;
            }
            h1 {
              color: #333;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
            .code {
              background: #f4f4f4;
              padding: 10px;
              border-radius: 4px;
              font-family: monospace;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="success">✓</div>
          <h1>Authentication Successful!</h1>
          <p>Your tokens have been saved successfully.</p>
          <p>You can now close this window and stop the authentication server.</p>
          <p>Your email watcher is ready to run!</p>
          <div class="code">Press Ctrl+C in the terminal to stop the server</div>
        </body>
      </html>
    `);

    // Optionally, you can automatically shutdown the server after a few seconds
    setTimeout(() => {
      console.log('\n👋 Shutting down authentication server...');
      process.exit(0);
    }, 3000);
  } catch (error) {
    console.error('\n❌ Error exchanging code for tokens:');
    if (axios.isAxiosError(error) && error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error);
    }

    res.send(`
      <h1>Token exchange failed</h1>
      <p>Please check the console for error details.</p>
    `);
  }
});

// Root route with instructions
app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Email Watcher Authentication Setup</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
          }
          h1 {
            color: #333;
          }
          .instructions {
            background: #f4f4f4;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .button {
            display: inline-block;
            background: #0078d4;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 20px;
          }
          .button:hover {
            background: #106ebe;
          }
          code {
            background: #e0e0e0;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <h1>🔐 Email Watcher Authentication Setup</h1>
        <div class="instructions">
          <h2>Instructions:</h2>
          <ol>
            <li>Click the "Start Authentication" button below</li>
            <li>Sign in with your Outlook account: <code>${process.env.MONITORED_EMAIL}</code></li>
            <li>Grant the requested permissions</li>
            <li>You'll be redirected back here upon success</li>
          </ol>
          <p><strong>Required Permissions:</strong></p>
          <ul>
            <li>Read your mail</li>
            <li>Read and write access to your mail</li>
            <li>Maintain access to data you have given it access to (offline_access)</li>
          </ul>
        </div>
        <a href="/auth/login" class="button">Start Authentication</a>
      </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 Email Watcher Authentication Setup');
  console.log('='.repeat(80));
  console.log(`\n📧 Monitored Email: ${process.env.MONITORED_EMAIL}`);
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`\n➡️  Open your browser and navigate to: http://localhost:${PORT}`);
  console.log('\n' + '='.repeat(80));
});

