import { prisma } from '../utils/db.js';
import { ScormCloudService } from '../services/ScormCloudService.js';
import { AttemptModel } from '../models/AttemptModel.js';
import { LearningPathEnrolmentModel } from '../models/LearningPathEnrolmentModel.js';


export class AttemptService {
    // Your existing course-level update (unchanged)
    static async updateProgress(courseId, data, user) {
        if (user.userRole !== 'LEARNER') throw new Error('Only learners can update progress');
        if (data.completionPercentage < 0 || data.completionPercentage > 100) throw new Error('Completion percentage must be 0-100');

        const attempt = await AttemptModel.upsert(user.id, courseId, data);

        const enrolments = await LearningPathEnrolmentModel.findByUserAndCourse(user.id, courseId);
        for (const enrolment of enrolments) {
            await LearningPathEnrolmentModel.updateProgress(enrolment.id, data.completionPercentage);
        }

        return attempt;
    }

    // New: Sync progress from SCORM Cloud for a specific ScormAttempt
    static async syncScormProgress(scormAttemptId) {
        const scormAttempt = await prisma.scormAttempt.findUnique({
            where: { id: scormAttemptId },
            include: { scormPackage: true, attempt: true }
        });

        if (!scormAttempt) throw new Error('ScormAttempt not found');
        if (!scormAttempt.scormCloudRegistrationId) throw new Error('No SCORM Cloud registration');

        const progress = await ScormCloudService.getRegistrationProgress(scormAttempt.scormCloudRegistrationId);

        const updateData = {
            status: progress.completion === 1 ? 'COMPLETED' : 'IN_PROGRESS',
            completionPercentage: Math.round((progress.completionAmount?.scaled || 0) * 100),
            score: progress.score?.raw || null,
            learningHours: progress.duration ? this.parseDurationToHours(progress.duration) : null,
            scormCloudLastSyncAt: new Date(),
            scormCloudCompletion: progress.completionAmount?.scaled || 0,
            scormCloudScoreScaled: progress.score?.scaled || null,
            updatedAt: new Date()
        };

        const updated = await prisma.scormAttempt.update({
            where: { id: scormAttemptId },
            data: updateData,
            include: { scormPackage: true, attempt: true }
        });

        // Roll up to course-level Attempt if linked
        if (updated.attemptId) {
            await this.rollUpCourseCompletion(updated.attemptId);
        }

        return updated;
    }

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

        const packageAttempts = courseAttempt.scormAttempts;

        const avgCompletion = packageAttempts.length > 0
            ? packageAttempts.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / packageAttempts.length
            : 0;

        await prisma.attempt.update({
            where: { id: courseAttemptId },
            data: {
                completionPercentage: avgCompletion,
                status: avgCompletion >= 100 ? 'COMPLETED' : 'IN_PROGRESS',
                updatedAt: new Date()
            }
        });
    }
}