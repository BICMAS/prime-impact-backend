import { Router } from 'express';
import { assignTemplateToCourse, assignTemplateToHRManager, claimLearnerCertificate, downloadLatestTemplate, downloadTemplate, getCourseAssignedTemplate, getMyAssignedTemplate, issueCertificate, uploadTemplate } from '../controllers/CertificateTemplateController.js';
import { authenticateToken, requireRole } from '../middleware/authMiddleware.js';

const certificateRouter = Router();

certificateRouter.post('/', authenticateToken, requireRole(['SUPER_ADMIN']), uploadTemplate);
certificateRouter.get('/latest/download', authenticateToken, requireRole(['HR_MANAGER', 'SUPER_ADMIN']), downloadLatestTemplate);
certificateRouter.get('/my-assigned-template', authenticateToken, requireRole(['HR_MANAGER']), getMyAssignedTemplate);
certificateRouter.get('/course/:courseId/template', authenticateToken, requireRole(['HR_MANAGER']), getCourseAssignedTemplate);
certificateRouter.get('/:id/download', authenticateToken, requireRole(['HR_MANAGER', 'SUPER_ADMIN']), downloadTemplate);
certificateRouter.post('/assign-template', authenticateToken, requireRole(['HR_MANAGER']), assignTemplateToCourse);
certificateRouter.post('/assign-to-hr', authenticateToken, requireRole(['SUPER_ADMIN']), assignTemplateToHRManager);
certificateRouter.post('/issue', authenticateToken, requireRole(['HR_MANAGER']), issueCertificate);
certificateRouter.post('/my-courses/:courseId/certificate', authenticateToken, requireRole(['LEARNER']), claimLearnerCertificate);

export default certificateRouter;
