import { DashboardModel } from '../models/DashboardModel.js';

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