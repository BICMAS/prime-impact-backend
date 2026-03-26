import { Router } from 'express';
import { assignTemplateToCourse, downloadLatestTemplate, downloadTemplate, issueCertificate, uploadTemplate } from '../controllers/CertificateTemplateController.js';
import { authenticateToken, requireRole } from '../middleware/authMiddleware.js';

const certificateRouter = Router();

certificateRouter.post('/', authenticateToken, requireRole(['HR_MANAGER', 'SUPER_ADMIN']), uploadTemplate);
certificateRouter.get('/latest/download', authenticateToken, requireRole(['HR_MANAGER', 'SUPER_ADMIN']), downloadLatestTemplate);
certificateRouter.get('/:id/download', authenticateToken, requireRole(['HR_MANAGER', 'SUPER_ADMIN']), downloadTemplate);
certificateRouter.post('/assign-template', authenticateToken, requireRole(['HR_MANAGER']), assignTemplateToCourse);
certificateRouter.post('/issue', authenticateToken, requireRole(['HR_MANAGER']), issueCertificate);

export default certificateRouter;
