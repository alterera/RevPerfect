import fs from 'fs';
import path from 'path';
import axios from 'axios';

const tokenPath = path.resolve('token.json');

interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

class TokenService {
  /**
   * Get a valid access token (refresh if needed)
   */
  async getAccessToken(): Promise<string> {
    // Check if token file exists
    if (!fs.existsSync(tokenPath)) {
      throw new Error(
        'token.json not found. Please run the authentication setup first.'
      );
    }

    // Read stored tokens
    const tokens: TokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    
    if (!tokens.refresh_token) {
      throw new Error('No refresh token found. Please run authentication setup.');
    }

    // Refresh the access token
    return await this.refreshAccessToken(tokens.refresh_token);
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const params = new URLSearchParams();
    params.append('client_id', process.env.MS_GRAPH_CLIENT_ID || '');
    params.append('scope', 'offline_access Mail.Read Mail.ReadWrite');
    params.append('refresh_token', refreshToken);
    params.append('redirect_uri', process.env.REDIRECT_URI || '');
    params.append('grant_type', 'refresh_token');
    params.append('client_secret', process.env.MS_GRAPH_CLIENT_SECRET || '');

    const tokenUrl =
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';

    try {
      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const newTokens: TokenData = response.data;

      // Save updated tokens (keep the new refresh token)
      fs.writeFileSync(tokenPath, JSON.stringify(newTokens, null, 2));
      console.log('✅ Access token refreshed successfully');

      return newTokens.access_token;
    } catch (error) {
      console.error('❌ Failed to refresh token:');
      if (axios.isAxiosError(error) && error.response) {
        console.error('Status:', error.response.status);
        console.error('Status Text:', error.response.statusText);
        console.error(
          'Response Data:',
          JSON.stringify(error.response.data, null, 2)
        );
      } else {
        console.error('Error:', error instanceof Error ? error.message : error);
      }
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Check if token file exists
   */
  hasToken(): boolean {
    return fs.existsSync(tokenPath);
  }

  /**
   * Save initial tokens (used during first-time setup)
   */
  saveTokens(tokens: TokenData): void {
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    console.log('✅ Tokens saved successfully');
  }
}

export const tokenService = new TokenService();
export default tokenService;

