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

        const registrationId = scormAttempt.scormCloudRegistrationId;

        // FIXED: Use correct endpoint
        const client = ScormCloudService.init();
        const res = await client.get(`/registrations/${registrationId}`);

        const registration = res.data;

        // Map fields (adjust based on actual response structure)
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

        // Roll up to course Attempt if linked
        if (updated.attemptId) {
            await this.rollUpCourseCompletion(updated.attemptId);
        }

        return updated;
    }
}