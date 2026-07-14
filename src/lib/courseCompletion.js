import { prisma } from '../utils/db.js';

export async function getCourseScormPackageIds(courseId) {
    const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
            scormPackageId: true,
            modules: {
                select: {
                    lessons: {
                        select: { scormPackageId: true },
                    },
                },
            },
        },
    });

    if (!course) return [];

    const packageIds = new Set();
    if (course.scormPackageId) packageIds.add(course.scormPackageId);
    for (const module of course.modules) {
        for (const lesson of module.lessons) {
            if (lesson.scormPackageId) packageIds.add(lesson.scormPackageId);
        }
    }

    return [...packageIds];
}

function isScormAttemptComplete(scormAttempt) {
    return scormAttempt.status === 'COMPLETED'
        || scormAttempt.status === 'PASSED'
        || (scormAttempt.completionPercentage ?? 0) >= 100;
}

export async function getAssignmentCompletionState(userId, courseId) {
    const courseAttempt = await prisma.attempt.findUnique({
        where: {
            userId_courseId: { userId, courseId },
        },
        select: {
            status: true,
            completionPercentage: true,
        },
    });

    if (courseAttempt?.status === 'COMPLETED' || (courseAttempt?.completionPercentage ?? 0) >= 100) {
        return {
            complete: true,
            progress: 100,
            status: 'COMPLETED',
        };
    }

    const packageIds = await getCourseScormPackageIds(courseId);
    if (packageIds.length === 0) {
        const progress = Math.round(courseAttempt?.completionPercentage ?? 0);
        return {
            complete: false,
            progress,
            status: courseAttempt?.status ?? 'NOT_STARTED',
        };
    }

    const scormAttempts = await prisma.scormAttempt.findMany({
        where: {
            userId,
            scormPackageId: { in: packageIds },
        },
        select: {
            completionPercentage: true,
            status: true,
        },
    });

    if (scormAttempts.length === 0) {
        const progress = Math.round(courseAttempt?.completionPercentage ?? 0);
        return {
            complete: false,
            progress,
            status: courseAttempt?.status ?? 'NOT_STARTED',
        };
    }

    const progress = Math.round(
        scormAttempts.reduce((sum, attempt) => sum + (attempt.completionPercentage ?? 0), 0)
            / scormAttempts.length,
    );
    const complete = scormAttempts.every(isScormAttemptComplete);

    return {
        complete,
        progress: complete ? 100 : progress,
        status: complete ? 'COMPLETED' : progress > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
    };
}
