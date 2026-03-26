import { CertificateTemplateModel } from '../models/CertificateTemplateModel.js';
import { CertificateModel } from '../models/CertificateModel.js';
import { CourseModel } from '../models/CourseModel.js';
import { UserModel } from '../models/UserModel.js';

export class CertificateTemplateService {
    static async uploadTemplate(filePath, filename, description, uploadedBy) {
        if (!uploadedBy) throw new Error('Uploader ID required');
        if (!filename) throw new Error('Filename required');
        if (!filename.endsWith('.pdf')) {  // FIXED: PDF only
            throw new Error('Only PDF templates allowed');
        }

        const mimeType = 'application/pdf';

        const result = await CertificateTemplateModel.uploadAndSave(filePath, filename, mimeType, description, uploadedBy);
        return result;
    }

    static async getTemplateById(id) {
        if (!id) throw new Error('Template ID required');
        const template = await CertificateTemplateModel.findById(id);
        if (!template) throw new Error('Certificate template not found');
        return template;
    }

    static async getLatestTemplate() {
        const template = await CertificateTemplateModel.findLatest();
        if (!template) throw new Error('No certificate templates found');
        return template;
    }

    static async assignTemplateToCourse(courseId, templateId, actorId) {
        if (!courseId) throw new Error('Course ID required');
        if (!templateId) throw new Error('Template ID required');
        if (!actorId) throw new Error('Actor ID required');

        const [course, template] = await Promise.all([
            CourseModel.findById(courseId),
            CertificateTemplateModel.findById(templateId)
        ]);

        if (!course) throw new Error('Course not found');
        if (!template) throw new Error('Certificate template not found');

        await CertificateModel.assignTemplateToCourse({ courseId, templateId, actorId });
        return { courseId, templateId };
    }

    static async issueCertificate({ userId, courseId, issuerId, templateId }) {
        if (!userId) throw new Error('User ID required');
        if (!courseId) throw new Error('Course ID required');
        if (!issuerId) throw new Error('Issuer ID required');

        const [user, course] = await Promise.all([
            UserModel.findById(userId),
            CourseModel.findById(courseId)
        ]);
        if (!user) throw new Error('User not found');
        if (!course) throw new Error('Course not found');

        const assignedTemplateId = await CertificateModel.getAssignedTemplateForCourse(courseId);
        const resolvedTemplateId = templateId || assignedTemplateId;
        if (!resolvedTemplateId) {
            throw new Error('No template assigned to course');
        }

        const template = await CertificateTemplateModel.findById(resolvedTemplateId);
        if (!template) throw new Error('Certificate template not found');

        const existing = await CertificateModel.findCertificateByUserAndCourse(userId, courseId);
        if (existing) throw new Error('Certificate already issued for this user and course');

        // Until PDF generation is added, keep a deterministic pointer to selected template
        const certificate = await CertificateModel.createCertificate({
            userId,
            courseId,
            templateId: resolvedTemplateId,
            pdfPath: template.blobUrl
        });

        return { ...certificate, issuedBy: issuerId };
    }
}
