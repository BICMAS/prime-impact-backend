import express from 'express';
import { prisma } from '../utils/db.js';

const scormCallbackRouter = express.Router();

// SCORM Cloud posts completion data here
scormCallbackRouter.post('/', express.urlencoded({ extended: true }), async (req, res) => {
    console.log('[SCORM CALLBACK] Received:', req.body);

    try {
        const {
            registration_id,
            course_id,
            learner_id,
            score,
            completion_status,
            total_seconds,
            success_status
        } = req.body;

        // Find package by SCORM Cloud course ID
        const scormPackage = await prisma.scormPackage.findFirst({
            where: { scormCloudId: course_id }
        });

        if (!scormPackage) {
            console.warn('[SCORM CALLBACK] Package not found for course:', course_id);
            return res.status(200).send('OK'); // Always return OK to SCORM Cloud
        }

        // Map SCORM status to your AttemptStatus enum
        const mapStatus = (scormStatus) => {
            switch (scormStatus?.toLowerCase()) {
                case 'passed': return 'PASSED';
                case 'completed': return 'COMPLETED';
                case 'failed': return 'FAILED';
                case 'incomplete': return 'INCOMPLETE';
                case 'browsed': return 'INCOMPLETE';
                default: return 'INCOMPLETE';
            }
        };

        // Update or create attempt record
        await prisma.attempt.upsert({
            where: {
                userId_courseId: {
                    userId: learner_id,
                    courseId: scormPackage.id
                }
            },
            update: {
                completionPercentage: score ? parseFloat(score) * 100 : 0,
                status: mapStatus(completion_status || success_status),
                score: score ? parseFloat(score) : 0,
                learningHours: total_seconds ? parseFloat(total_seconds) / 3600 : null,
                updatedAt: new Date()
            },
            create: {
                userId: learner_id,
                courseId: scormPackage.id,
                completionPercentage: score ? parseFloat(score) * 100 : 0,
                status: mapStatus(completion_status || success_status),
                score: score ? parseFloat(score) : 0,
                learningHours: total_seconds ? parseFloat(total_seconds) / 3600 : null
            }
        });

        console.log('[SCORM CALLBACK] Successfully updated attempt for learner:', learner_id);
        res.status(200).send('OK');

    } catch (error) {
        console.error('[SCORM CALLBACK ERROR]', error);
        // Still return OK so SCORM Cloud doesn't retry
        res.status(200).send('OK');
    }
});

export default scormCallbackRouter