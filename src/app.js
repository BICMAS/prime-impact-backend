import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import router from './routes/index.js';
import cors from 'cors';

dotenv.config();  // Load env early

const app = express();
const port = process.env.PORT || 5000;


const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });


app.use(express.json());
app.use(express.urlencoded({ limit: '200mb', extended: true }));


app.use((req, res, next) => {
    req.setTimeout(300000);  // 5min per request for everything
    res.setTimeout(300000);
    next();
});
app.use(cors());

// Health route
app.get('/', (req, res) => {
    res.json({ message: 'Hello World! This is the LLM project 🚀', timestamp: new Date().toISOString() });
});

app.use('/api/v1', router);

// Prompts route (example—paginate if large)
app.get('/prompts', async (req, res) => {
    try {
        const prompts = await prisma.prompt.findMany({
            take: 20,  // Limit for perf
            orderBy: { createdAt: 'desc' }
        });
        res.json(prompts);
    } catch (error) {
        console.error('Prompts query error:', error);
        res.status(500).json({ error: 'Failed to fetch prompts' });
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await prisma.$disconnect();
    // await redis.quit().catch(console.error);  // Uncomment if using Redis
    process.exit(0);
});

app.use((err, req, res, next) => {
    console.error('[GLOBAL ERROR HANDLER]', err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
server.keepAliveTimeout = 65000;
server.timeout = 300000;
