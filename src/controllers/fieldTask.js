// src/controllers/FieldTaskController.js

import { put } from '@vercel/blob';
import { prisma } from '../utils/db.js';

// Create new field task (learner only)
export const createFieldTask = async (req, res) => {
    try {
        const { moduleTitle, description } = req.body;
        const file = req.file;

        if (!description?.trim()) {
            return res.status(400).json({ success: false, error: 'Description is required' });
        }

        if (!file) {
            return res.status(400).json({ success: false, error: 'Media file is required' });
        }

        const userId = req.user.id;

        const blob = await put(file.originalname, file.buffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
            addRandomSuffix: true,
            contentType: file.mimetype
        });

        const fieldTask = await prisma.fieldTask.create({
            data: {
                moduleTitle: moduleTitle?.trim() || null,
                description: description.trim(),
                mediaUrl: blob.url,
                mediaType: file.mimetype.startsWith('image') ? 'image' : 'video',
                createdBy: userId
            }
        });

        res.status(201).json({
            success: true,
            data: fieldTask,
            message: 'Field task submitted successfully'
        });
    } catch (error) {
        console.error('[FIELD TASK CREATE ERROR]', error);
        res.status(500).json({ success: false, error: error.message });
    }
};


// View MY OWN tasks (for the learner)
export const getMyFieldTasks = async (req, res) => {
    try {
        const userId = req.user.id;

        const tasks = await prisma.fieldTask.findMany({
            where: { createdBy: userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                moduleTitle: true,
                description: true,
                mediaUrl: true,
                mediaType: true,
                createdAt: true,
                updatedAt: true
            }
        });

        res.json({ success: true, data: tasks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// View ALL tasks (HR_MANAGER / SUPER_ADMIN only)
// src/controllers/FieldTaskController.js
export const getAllFieldTasks = async (req, res) => {
    try {
        console.log('[DEBUG] getAllFieldTasks called by user:', req.user?.id, 'Role:', req.user?.userRole);

        // 1. Total count - no filters
        const totalCount = await prisma.fieldTask.count();
        console.log('[DEBUG] Total FieldTask records in DB:', totalCount);

        // 2. Sample records - no where clause
        const sampleTasks = await prisma.fieldTask.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                moduleTitle: true,
                description: true,
                mediaUrl: true,
                mediaType: true,
                createdBy: true,
                createdAt: true
            }
        });
        console.log('[DEBUG] Sample FieldTask records:', JSON.stringify(sampleTasks, null, 2));

        // 3. Actual query (what you normally use)
        const tasks = await prisma.fieldTask.findMany({
            skip: 0,
            take: 50,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        userRole: true
                    }
                }
            }
        });

        res.json({
            success: true,
            totalInDB: totalCount,
            sampleRecords: sampleTasks,
            data: tasks
        });

    } catch (error) {
        console.error('[GET ALL FIELD TASKS ERROR]', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
};