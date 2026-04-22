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

        if (!registration_id || !learner_id) {
            console.warn('[SCORM CALLBACK] Missing registration_id or learner_id');
            return res.status(200).send('OK');
        }

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

        const parsedScore = score ? parseFloat(score) : 0;
        const parsedLearningHours = total_seconds ? parseFloat(total_seconds) / 3600 : null;
        const mappedStatus = mapStatus(completion_status || success_status);
        const completion = parsedScore * 100;

        const scormAttempt = await prisma.scormAttempt.findUnique({
            where: { scormCloudRegistrationId: registration_id },
            include: { attempt: { select: { id: true } } }
        });

        let courseAttemptId = scormAttempt?.attemptId || null;

        // If no link exists yet, use/seed a package-level Attempt so learner appears in attempts table.
        if (!courseAttemptId) {
            const packageAttempt = await prisma.attempt.upsert({
                where: {
                    userId_scormPackageId: {
                        userId: learner_id,
                        scormPackageId: scormPackage.id
                    }
                },
                update: {
                    status: mappedStatus,
                    completionPercentage: completion,
                    score: parsedScore,
                    learningHours: parsedLearningHours,
                    updatedAt: new Date()
                },
                create: {
                    userId: learner_id,
                    scormPackageId: scormPackage.id,
                    status: mappedStatus,
                    completionPercentage: completion,
                    score: parsedScore,
                    learningHours: parsedLearningHours
                },
                select: { id: true }
            });
            courseAttemptId = packageAttempt.id;
        } else {
            await prisma.attempt.update({
                where: { id: courseAttemptId },
                data: {
                    status: mappedStatus,
                    completionPercentage: completion,
                    score: parsedScore,
                    learningHours: parsedLearningHours,
                    updatedAt: new Date()
                }
            });
        }

        await prisma.scormAttempt.upsert({
            where: {
                userId_scormPackageId: {
                    userId: learner_id,
                    scormPackageId: scormPackage.id
                }
            },
            update: {
                attemptId: courseAttemptId,
                scormCloudRegistrationId: registration_id,
                status: mappedStatus,
                completionPercentage: completion,
                score: parsedScore,
                learningHours: parsedLearningHours,
                scormCloudLastSyncAt: new Date(),
                scormCloudCompletion: completion / 100,
                scormCloudScoreScaled: parsedScore,
                updatedAt: new Date()
            },
            create: {
                userId: learner_id,
                scormPackageId: scormPackage.id,
                attemptId: courseAttemptId,
                scormCloudRegistrationId: registration_id,
                status: mappedStatus,
                completionPercentage: completion,
                score: parsedScore,
                learningHours: parsedLearningHours,
                scormCloudLastSyncAt: new Date(),
                scormCloudCompletion: completion / 100,
                scormCloudScoreScaled: parsedScore
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