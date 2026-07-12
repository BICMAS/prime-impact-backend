import { prisma } from '../utils/db.js';
import { ScormCloudService } from '../services/ScormCloudService.js';
import { AttemptModel } from '../models/AttemptModel.js';
import { LearningPathEnrolmentModel } from '../models/LearningPathEnrolmentModel.js';
import { EconomyService } from './EconomyService.js';

export class AttemptService {
    // Your existing course-level update (unchanged)
    static async updateProgress(courseId, data, user) {
        if (user.userRole !== 'LEARNER') throw new Error('Only learners can update progress');
        if (data.completionPercentage < 0 || data.completionPercentage > 100) throw new Error('Completion percentage must be 0-100');

        const existing = await AttemptModel.findByUserAndCourse(user.id, courseId);
        const previousStatus = existing?.status ?? 'NOT_STARTED';

        const attempt = await AttemptModel.upsert(user.id, courseId, data);

        const enrolments = await LearningPathEnrolmentModel.findByUserAndCourse(user.id, courseId);
        for (const enrolment of enrolments) {
            await LearningPathEnrolmentModel.updateProgress(enrolment.id, data.completionPercentage);
        }

        const newStatus = attempt.status ?? data.status ?? previousStatus;
        await EconomyService.onCourseCompleted(user.id, courseId, previousStatus, newStatus);

        return attempt;
    }

    // Sync progress from SCORM Cloud for a specific ScormAttempt
    static async syncScormProgress(scormAttemptId, requester) {
        const scormAttempt = await prisma.scormAttempt.findUnique({
            where: { id: scormAttemptId },
            include: { scormPackage: true, attempt: true }
        });

        if (!scormAttempt) throw new Error('ScormAttempt not found');
        if (!scormAttempt.scormCloudRegistrationId) throw new Error('No SCORM Cloud registration');

        if (requester.userRole === 'LEARNER' && scormAttempt.userId !== requester.id) {
            throw new Error('Access denied');
        }

        if (requester.userRole === 'HR_MANAGER') {
            const owner = await prisma.user.findUnique({
                where: { id: scormAttempt.userId },
                select: { orgId: true },
            });
            if (!owner || owner.orgId !== requester.orgId) {
                throw new Error('Access denied');
            }
        }

        const registrationId = scormAttempt.scormCloudRegistrationId;

        const previousStatus = scormAttempt.status;

        // Pull registration details from SCORM Cloud (correct endpoint)
        const client = ScormCloudService.init();
        const res = await client.get(`/registrations/${registrationId}`);

        const registration = res.data;

        // Map Cloud data to ScormAttempt
        const updateData = {
            status: registration.registrationCompletion === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
            completionPercentage: Math.round((registration.registrationCompletionAmount || 0) * 100),
            score: registration.score?.raw || null,
            learningHours: registration.totalSecondsTracked ? registration.totalSecondsTracked / 3600 : null,
            scormCloudLastSyncAt: new Date(),
            scormCloudCompletion: registration.registrationCompletionAmount || 0,
            scormCloudScoreScaled: registration.score?.scaled || null,
            updatedAt: new Date()
        };

        const updated = await prisma.scormAttempt.update({
            where: { id: scormAttemptId },
            data: updateData,
            include: { scormPackage: true, attempt: true }
        });

        await EconomyService.onModuleCompleted(
            updated.userId,
            updated.scormPackageId,
            previousStatus,
            updated.status,
        );

        // Roll up to course Attempt if linked
        if (updated.attemptId) {
            await AttemptService.rollUpCourseCompletion(updated.attemptId);
        }

        return updated;
    }

    // Helper: Parse ISO 8601 duration (e.g. PT1H2M3S) to hours
    static parseDurationToHours(duration) {
        if (!duration) return null;
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+\.?\d*)S)?/);
        if (!match) return null;
        const h = parseFloat(match[1] || 0);
        const m = parseFloat(match[2] || 0);
        const s = parseFloat(match[3] || 0);
        return h + m / 60 + s / 3600;
    }

    // Roll up package progress to course-level Attempt
    static async rollUpCourseCompletion(courseAttemptId) {
        const courseAttempt = await prisma.attempt.findUnique({
            where: { id: courseAttemptId },
            include: { scormAttempts: true }
        });

        if (!courseAttempt) return;

        const previousStatus = courseAttempt.status;
        const packageAttempts = courseAttempt.scormAttempts;

        const avgCompletion = packageAttempts.length > 0
            ? packageAttempts.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / packageAttempts.length
            : 0;

        const newStatus = avgCompletion >= 100 ? 'COMPLETED' : 'IN_PROGRESS';

        await prisma.attempt.update({
            where: { id: courseAttemptId },
            data: {
                completionPercentage: avgCompletion,
                status: newStatus,
                updatedAt: new Date()
            }
        });

        if (courseAttempt.courseId) {
            await EconomyService.onCourseCompleted(
                courseAttempt.userId,
                courseAttempt.courseId,
                previousStatus,
                newStatus,
            );
        }
    }
}