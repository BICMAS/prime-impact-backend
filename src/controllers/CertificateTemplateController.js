import multer from 'multer';
import fs from 'fs';
import { CertificateTemplateService } from '../service/CertificateTemplateService.js';

const upload = multer({
    storage: multer.diskStorage({
        destination: 'uploads/temp/',
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
    }),
    limits: { fileSize: 10 * 1024 * 1024 },  // 10MB for PDFs
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files allowed'), false);
        }
    }
});

export const uploadTemplate = (req, res) => {
    upload.single('template')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: 'Upload failed' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        try {
            const uploadedBy = req.user.id;
            const { description } = req.body;  // Optional
            const result = await CertificateTemplateService.uploadTemplate(req.file.path, req.file.originalname, description, uploadedBy);
            res.status(201).json({
                url: result.blobUrl,
                id: result.id,
                filename: result.filename,
                downloadUrl: `${req.protocol}://${req.get('host')}/api/v1/certificates/${result.id}/download`
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);  // Clean temp
            }
        }
    });
};

export const downloadTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const template = await CertificateTemplateService.getTemplateById(id);

        const response = await fetch(template.blobUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch template file');
        }

        const fileBuffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', template.mimeType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
        return res.status(200).send(fileBuffer);
    } catch (error) {
        const status = error.message === 'Certificate template not found' ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
};

export const downloadLatestTemplate = async (req, res) => {
    try {
        const template = await CertificateTemplateService.getLatestTemplate();

        const response = await fetch(template.blobUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch template file');
        }

        const fileBuffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', template.mimeType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
        return res.status(200).send(fileBuffer);
    } catch (error) {
        const status = error.message === 'No certificate templates found' ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
};

export const assignTemplateToCourse = async (req, res) => {
    try {
        const { courseId, templateId } = req.body;
        const result = await CertificateTemplateService.assignTemplateToCourse(courseId, templateId, req.user.id, req.user);
        return res.status(200).json({
            message: 'Template assigned to course successfully',
            ...result
        });
    } catch (error) {
        const knownNotFound = ['Course not found', 'Certificate template not found'];
        const status = knownNotFound.includes(error.message) ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
};

export const assignTemplateToHRManager = async (req, res) => {
    try {
        const { templateId, orgId, hrManagerId } = req.body;
        const result = await CertificateTemplateService.assignTemplateToHRManager({
            templateId,
            orgId,
            hrManagerId,
            actorId: req.user.id
        });
        return res.status(200).json({
            message: 'Template assigned to HR manager successfully',
            ...result
        });
    } catch (error) {
        const knownNotFound = ['Certificate template not found', 'HR manager not found'];
        const status = knownNotFound.includes(error.message) ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
};

export const getMyAssignedTemplate = async (req, res) => {
    try {
        const result = await CertificateTemplateService.getAssignedTemplateForHRManager(req.user.id, req.user.orgId);
        return res.status(200).json(result);
    } catch (error) {
        const knownNotFound = [
            'No certificate template assigned to this HR manager',
            'Certificate template not found'
        ];
        const status = knownNotFound.includes(error.message) ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
};

export const getCourseAssignedTemplate = async (req, res) => {
    try {
        const { courseId } = req.params;
        const result = await CertificateTemplateService.getAssignedTemplateForCourse(courseId);
        return res.status(200).json(result);
    } catch (error) {
        const knownNotFound = [
            'Course not found',
            'No template assigned to course',
            'Certificate template not found'
        ];
        const status = knownNotFound.includes(error.message) ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
};

export const issueCertificate = async (req, res) => {
    try {
        const { userId, courseId, templateId } = req.body;
        const result = await CertificateTemplateService.issueCertificate({
            userId,
            courseId,
            templateId,
            issuerId: req.user.id,
            requester: req.user
        });
        return res.status(201).json(result);
    } catch (error) {
        const knownNotFound = [
            'User not found',
            'Course not found',
            'Certificate template not found'
        ];
        const status = knownNotFound.includes(error.message) ? 404 : 400;
        return res.status(status).json({ error: error.message });
    }
};

export const claimLearnerCertificate = async (req, res) => {
    try {
        const { courseId } = req.params;
        const result = await CertificateTemplateService.claimLearnerCertificate(req.user.id, courseId);
        return res.status(200).json(result);
    } catch (error) {
        const knownNotFound = [
            'Course not assigned to learner',
            'Course not found',
            'No template assigned to course',
            'Certificate template not found'
        ];
        const status = error.message === 'Course not yet completed'
            ? 403
            : knownNotFound.includes(error.message)
                ? 404
                : 400;
        return res.status(status).json({ error: error.message });
    }
};
