/**
 * NetMinder Server
 * Main Elysia application entry point
 */

import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

import { routes as apiRoutes } from '@netminder/api';
import clientHTML from '@netminder/client/index.html';
import { initDatabase } from '@netminder/dal';

// Environment configuration
const PORT = parseInt(process.env.PORT ?? '8080', 10);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

function assertConfiguration(environment: string): void {
    const isProduction = environment === 'production';
    const missing: string[] = [];

    const jwtSecret = process.env.JWT_SECRET?.trim();
    if (!jwtSecret) {
        if (isProduction) {
            missing.push('JWT_SECRET');
        } else {
            console.warn('Warning: Using default JWT_SECRET in development. Set JWT_SECRET for production.');
        }
    }

    const encryptionKey = process.env.CONFIG_ENCRYPTION_KEY?.trim();
    if (!encryptionKey) {
        if (isProduction) {
            missing.push('CONFIG_ENCRYPTION_KEY');
        } else {
            console.warn('Warning: Using default CONFIG_ENCRYPTION_KEY in development. Set CONFIG_ENCRYPTION_KEY for production.');
        }
    }

    if (missing.length > 0) {
        console.error(`Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
}

assertConfiguration(NODE_ENV);

console.log(`Starting NetMinder server in ${NODE_ENV} mode...`);

// Initialize database schema
console.log('Initializing database...');
initDatabase();

// Create and configure the Elysia app
new Elysia()
    // Enable CORS for development
    .use(cors({
        origin: NODE_ENV === 'development' ? '*' : false,
        credentials: true
    }))
    .onAfterHandle(({ set }) => {
        const headers = set.headers;

        if (NODE_ENV === 'production') {
            headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
        }

        headers['X-Content-Type-Options']  = 'nosniff';
        headers['X-Frame-Options']         = 'DENY';
        headers['Referrer-Policy']         = 'no-referrer';
        headers['Content-Security-Policy'] = 'default-src \'self\'; img-src \'self\' data: https://tile.openstreetmap.org https://mesonet.agron.iastate.edu; style-src \'self\' \'unsafe-inline\' https:; script-src \'self\' https:; font-src \'self\' data: https:; frame-ancestors \'none\'; base-uri \'self\'';
        set.headers = headers;
    })

    // Register API with a real '/api/*' prefix (not ALL method)
    .use(apiRoutes)

    // Serve React SPA for all non-API routes
    .get('/*', clientHTML)

    // Start the server
    .listen(PORT);

console.log(`🚀 NetMinder server running at http://localhost:${PORT}`);
console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
console.log(`💾 Database: ${process.env.DATABASE_PATH ?? 'data/netminder.sqlite3'}`);