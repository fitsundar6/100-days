const { execSync } = require('child_process');

// Ensure DATABASE_URL is defined so `prisma generate` never fails during build
if (!process.env.DATABASE_URL) {
  console.log('Notice: DATABASE_URL not set in build environment. Using fallback for Prisma Client generation.');
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/alphaxgym?schema=public';
}

try {
  console.log('Step 1/2: Generating Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit', env: process.env });

  console.log('Step 2/2: Compiling TypeScript to dist...');
  execSync('npx tsc', { stdio: 'inherit', env: process.env });

  console.log('Build complete: dist/src/server.js is ready.');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
