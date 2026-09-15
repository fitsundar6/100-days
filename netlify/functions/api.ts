import serverless from 'serverless-http';
import app from '../../src/server';

const serverlessHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  // Ensure the URL path maps cleanly to Express /api routes regardless of Netlify redirect scheme
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    const stripped = event.path.replace(/^\/\.netlify\/functions\/api/, '');
    event.path = stripped.startsWith('/api') ? stripped : `/api${stripped}`;
  }
  return serverlessHandler(event, context);
};
