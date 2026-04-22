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
        const userOrgId = req.user.orgId;

        if (!userOrgId) {
            return res.status(400).json({ success: false, error: 'User must belong to an organization' });
        }

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
        const userOrgId = req.user.orgId;

        if (!userOrgId) {
            return res.status(400).json({ success: false, error: 'User must belong to an organization' });
        }

        const tasks = await prisma.fieldTask.findMany({
            where: {
                createdBy: userId,
                user: { orgId: userOrgId }
            },
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
        const userOrgId = req.user.orgId;
        const requestedOrgId = typeof req.query.orgId === 'string' ? req.query.orgId.trim() : null;
        const effectiveOrgId = req.user.userRole === 'SUPER_ADMIN' && requestedOrgId
            ? requestedOrgId
            : userOrgId;

        if (!effectiveOrgId) {
            return res.status(400).json({
                success: false,
                error: 'User must belong to an organization'
            });
        }

        const { limit = 50, offset = 0 } = req.query;
        const take = parseInt(limit, 10);
        const skip = parseInt(offset, 10);

        const tasks = await prisma.fieldTask.findMany({
            where: {
                user: { orgId: effectiveOrgId }
            },
            skip,
            take,
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

        const total = await prisma.fieldTask.count({
            where: {
                user: { orgId: effectiveOrgId }
            }
        });

        res.json({
            success: true,
            data: tasks,
            meta: {
                orgId: effectiveOrgId,
                total,
                limit: take,
                offset: skip,
                pageCount: take > 0 ? Math.ceil(total / take) : 0
            }
        });

    } catch (error) {
        console.error('[GET ALL FIELD TASKS ERROR]', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};