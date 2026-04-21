import { DashboardModel } from '../models/DashboardModel.js';
import { UserModel } from '../models/UserModel.js';
import { AttemptModel } from '../models/AttemptModel.js';

export class DashboardService {
    static async getHRDashboard(orgId) {
        console.log('[DASHBOARD SERVICE] Fetching for orgId:', orgId);
        const [totalLearners, averageCompletion, overdueCourses, activeAssignments, topPerformers, completionByDepartment, courseStatus] = await Promise.all([

            DashboardModel.getTotalLearners(orgId),
            DashboardModel.getAverageCompletion(orgId),
            DashboardModel.getOverdueCourses(orgId),
            DashboardModel.getActiveAssignments(orgId),
            DashboardModel.getTopPerformers(orgId),
            DashboardModel.getCompletionByDepartment(orgId),
            DashboardModel.getCourseStatus(orgId)
        ]);

        return {
            totalLearners,
            averageCompletion: Math.round(averageCompletion * 100) / 100,  // 2 decimals
            overdueCourses,
            activeAssignments,
            topPerformers,
            completionByDepartment,
            courseStatus
        };
    }

    static async getSuperAdminDashboard() {
        console.log('[DASHBOARD SERVICE SUPER] Fetching global dashboard');
        const [activeLearners, completionRate, averageSession, systemLoad, recentActivities, learningActivityGraph, recentActivity, criticalAlerts] = await Promise.all([
            DashboardModel.getActiveLearners(),
            DashboardModel.getCompletionRate(),
            //DashboardModel.getAverageSession(),
            DashboardModel.getSystemLoad(),
            DashboardModel.getRecentActivities(),
            DashboardModel.getLearningActivityGraph(),
            DashboardModel.getRecentActivity(),
            // DashboardModel.getCriticalAlerts()
        ]);

        return {
            activeLearners,
            completionRate: Math.round(completionRate * 100) / 100,
            averageSession,
            systemLoad,
            recentActivities,
            learningActivityGraph,  // For frontend line chart
            recentActivity,
            //criticalAlerts
        };
    }


}

export class LearnerDashboardService {
    static async getLearnerDashboard(user) {
        console.log('[LEARNER DASHBOARD SERVICE] For user ID:', user.id);
        const [streak, points, learningHours, coursesDone, averageScore, learningPaths, learningActivity, currentCourse, unfinishedCourses] = await Promise.all([
            DashboardModel.getLearnerStreak(user.id),
            DashboardModel.getLearnerPoints(user.id),
            DashboardModel.getLearnerHours(user.id),
            DashboardModel.getCoursesDone(user.id),
            DashboardModel.getAverageScore(user.id),
            DashboardModel.getLearnerPaths(user.id),
            DashboardModel.getLearningActivity(user.id),
            DashboardModel.getCurrentCourse(user.id),
            DashboardModel.getUnfinishedCourses(user.id)
        ]);

        return {
            streak,
            points,
            learningHours: Math.round(learningHours * 100) / 100,
            coursesDone,
            averageScore: Math.round(averageScore * 100) / 100,
            learningPaths,
            learningActivity,
            currentCourse,
            unfinishedCourses
        };
    }
}

export class HRCourseTrackingService {
    static buildLearnerStats(attempts = [], unfinishedCourses = []) {
        const assignedCourses = unfinishedCourses.length;
        const completedAttempts = attempts.filter((a) => a.status === 'COMPLETED');
        const inProgressAttempts = attempts.filter((a) => a.status === 'IN_PROGRESS');
        const overdueAttempts = attempts.filter((a) => a.dueDate && a.dueDate < new Date() && a.status !== 'COMPLETED');

        const uniqueCompletedCourses = new Set(
            completedAttempts
                .map((a) => a.courseId)
                .filter(Boolean)
        ).size;

        const avgCompletionRaw = attempts.length > 0
            ? attempts.reduce((sum, a) => sum + (a.completionPercentage || 0), 0) / attempts.length
            : 0;

        const latestActivityDate = attempts.reduce((latest, attempt) => {
            const updatedAt = attempt?.updatedAt ? new Date(attempt.updatedAt) : null;
            if (!updatedAt) return latest;
            if (!latest) return updatedAt;
            return updatedAt > latest ? updatedAt : latest;
        }, null);

        return {
            assignedCourses,
            completedCourses: uniqueCompletedCourses,
            inProgressCourses: inProgressAttempts.length,
            overdueCourses: overdueAttempts.length,
            avgCompletion: Math.round(avgCompletionRaw * 100) / 100,
            lastActiveAt: latestActivityDate ? latestActivityDate.toISOString() : null
        };
    }

    static async getLearnerCourseTracking({ orgId }, learnerId) {
        if (!orgId) throw new Error('HR must be in an organization');
        if (!learnerId) throw new Error('Learner ID required');

        const learner = await UserModel.findById(learnerId);
        if (!learner) throw new Error('Learner not found');
        if (learner.orgId !== orgId) throw new Error('Access denied');

        // AttemptModel is course-level progress (one attempt per userId+courseId via upsert)
        const attempts = await AttemptModel.findByUserId(learnerId);

        const currentCourse = await DashboardModel.getCurrentCourse(learnerId);
        const unfinishedCourses = await DashboardModel.getUnfinishedCourses(learnerId);
        const stats = HRCourseTrackingService.buildLearnerStats(attempts, unfinishedCourses);

        return {
            learner: {
                id: learner.id,
                fullName: learner.fullName,
                email: learner.email,
                userRole: learner.userRole,
                status: learner.status,
                orgId: learner.orgId
            },
            attempts,
            currentCourse,
            unfinishedCourses,
            stats
        };
    }

    static async getAllLearnersCourseTracking({ orgId }) {
        if (!orgId) throw new Error('HR must be in an organization');

        const learners = await UserModel.findLearnersByOrgId(orgId);
        if (!learners || learners.length === 0) {
            return { learners: [], count: 0 };
        }

        const tracking = await Promise.all(
            learners.map(async (learner) => {
                const attempts = await AttemptModel.findByUserId(learner.id);
                const currentCourse = await DashboardModel.getCurrentCourse(learner.id);
                const unfinishedCourses = await DashboardModel.getUnfinishedCourses(learner.id);
                const stats = HRCourseTrackingService.buildLearnerStats(attempts, unfinishedCourses);

                return {
                    learner,
                    attempts,
                    currentCourse,
                    unfinishedCourses,
                    stats
                };
            })
        );

        return { learners: tracking, count: tracking.length };
    }
}