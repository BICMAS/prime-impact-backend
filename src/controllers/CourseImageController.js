import { put } from '@vercel/blob';
import { prisma } from '../utils/db.js';

export const addCourseImage = async (req, res) => {
    try {
        const { courseId } = req.params;
        const file = req.file; // from multer

        if (!courseId) {
            return res.status(400).json({
                success: false,
                error: 'courseId is required in URL params'
            });
        }

        if (!file) {
            return res.status(400).json({
                success: false,
                error: 'Image file is required (multipart/form-data, field name: "image")'
            });
        }

        const userId = req.user.id;

        // Optional: Check permissions (e.g., admin or course creator)
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { createdBy: true }
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }

        const isAuthorized =
            req.user.userRole === 'SUPER_ADMIN' ||
            req.user.userRole === 'HR_MANAGER' ||
            course.createdBy === userId;

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to update this course image'
            });
        }

        // Validate file type (images only)
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({
                success: false,
                error: 'Only JPEG, PNG, GIF, or WebP images are allowed'
            });
        }

        // Upload to Vercel Blob
        const blob = await put(file.originalname, file.buffer, {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN,
            addRandomSuffix: true,
            contentType: file.mimetype
        });

        // Update course with new image URL
        const updatedCourse = await prisma.course.update({
            where: { id: courseId },
            data: {
                imageUrl: blob.url
            },
            select: {
                id: true,
                title: true,
                imageUrl: true,
                updatedAt: true
            }
        });

        res.json({
            success: true,
            data: updatedCourse,
            message: 'Course image updated successfully'
        });
    } catch (error) {
        console.error('[ADD COURSE IMAGE ERROR]', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to upload course image'
        });
    }
};