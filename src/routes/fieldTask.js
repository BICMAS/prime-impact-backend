import { Router } from 'express';
import multer from 'multer';
import { createFieldTask, getAllFieldTasks, getMyFieldTasks } from '../controllers/fieldTask.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const fieldRouter = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only images and videos allowed'));
    }
});
fieldRouter.get('/', authenticateToken, getAllFieldTasks);

// Submit new field task
fieldRouter.post('/', authenticateToken, upload.single('media'), createFieldTask);

// Get all my submitted field tasks

export default fieldRouter;