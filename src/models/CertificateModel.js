import crypto from 'crypto';
import { prisma } from '../utils/db.js';

const COURSE_TEMPLATE_EVENT = 'COURSE_TEMPLATE_ASSIGNED';

export class CertificateModel {
    static async findCertificateByUserAndCourse(userId, courseId) {
        return prisma.certificate.findUnique({
            where: { userId_courseId: { userId, courseId } }
        });
    }

    static async createCertificate({ userId, courseId, templateId, pdfPath }) {
        return prisma.certificate.create({
            data: {
                userId,
                courseId,
                templateId,
                pdfPath,
                verificationHash: crypto.randomUUID()
            }
        });
    }

    static async assignTemplateToCourse({ courseId, templateId, actorId }) {
        const existing = await prisma.auditLog.findFirst({
            where: {
                eventType: COURSE_TEMPLATE_EVENT,
                targetType: 'COURSE',
                targetId: courseId
            },
            orderBy: { createdAt: 'desc' }
        });

        const payload = { courseId, templateId };
        if (existing) {
            return prisma.auditLog.update({
                where: { id: existing.id },
                data: { actorId, payload }
            });
        }

        return prisma.auditLog.create({
            data: {
                eventType: COURSE_TEMPLATE_EVENT,
                actorId,
                targetType: 'COURSE',
                targetId: courseId,
                payload
            }
        });
    }

    static async getAssignedTemplateForCourse(courseId) {
        const log = await prisma.auditLog.findFirst({
            where: {
                eventType: COURSE_TEMPLATE_EVENT,
                targetType: 'COURSE',
                targetId: courseId
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!log?.payload || typeof log.payload !== 'object') return null;
        return log.payload?.templateId || null;
    }
}
