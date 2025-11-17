import dotenv from 'dotenv';

dotenv.config();

interface Config {
  azure: {
    storageConnectionString: string;
    containerName: string;
  };
  graph: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    redirectUri: string;
  };
  email: {
    monitoredEmail: string;
  };
  scheduler: {
    emailCheckCron: string;
  };
  database: {
    url: string;
  };
  env: string;
}

function validateConfig(): Config {
  const requiredEnvVars = [
    'AZURE_STORAGE_CONNECTION_STRING',
    'MS_GRAPH_CLIENT_ID',
    'MS_GRAPH_CLIENT_SECRET',
    'DATABASE_URL',
  ];

  const missing = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    azure: {
      storageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING!,
      containerName: process.env.AZURE_BLOB_CONTAINER_NAME || 'hotel-files',
    },
    graph: {
      clientId: process.env.MS_GRAPH_CLIENT_ID!,
      clientSecret: process.env.MS_GRAPH_CLIENT_SECRET!,
      tenantId: process.env.MS_GRAPH_TENANT_ID || 'consumers',
      redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback',
    },
    email: {
      monitoredEmail:
        process.env.MONITORED_EMAIL || 'history.forecast@outlook.com',
    },
    scheduler: {
      emailCheckCron: process.env.EMAIL_CHECK_CRON || '* * * * *',
    },
    database: {
      url: process.env.DATABASE_URL!,
    },
    env: process.env.NODE_ENV || 'development',
  };
}

export const config = validateConfig();

export default config;

