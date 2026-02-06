// src/controllers/ScormController.js
import { ScormService } from '../service/ScormService.js';

export const uploadPackage = async (req, res) => {
    console.log('[SCORM CONTROLLER] Upload request received');

    if (!req.file) {
        return res.status(400).json({
            error: 'No file uploaded. Please use "package" field with a SCORM ZIP file.'
        });
    }

    console.log('[SCORM CONTROLLER] File:', {
        name: req.file.originalname,
        size: req.file.size,
        path: req.file.path
    });

    try {
        const uploadedBy = req.user.id;
        const result = await ScormService.uploadPackage(
            req.file.path,
            req.file.originalname,
            uploadedBy
        );

        console.log('[SCORM CONTROLLER] Upload successful:', result.id);

        res.status(201).json({
            success: true,
            data: result,
            message: 'SCORM package uploaded successfully to SCORM Cloud'
        });

    } catch (error) {
        console.error('[SCORM CONTROLLER UPLOAD ERROR]', error.message);

        // Clean up temp file if upload failed
        try {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        } catch (cleanupError) {
            console.warn('[SCORM CONTROLLER] Failed to clean temp file:', cleanupError.message);
        }

        const statusCode = error.message.includes('not found') ? 404 :
            error.message.includes('credentials') ? 401 :
                error.message.includes('permission') ? 403 : 400;

        res.status(statusCode).json({
            success: false,
            error: error.message,
            details: error.details || null
        });
    }
};

export const getLaunch = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[SCORM CONTROLLER] Launch request for package:', id);

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Package ID is required'
            });
        }

        const launchUrl = await ScormService.getLaunchUrl(
            id,
            req.user.id,
            req.user.fullName || req.user.email
        );

        console.log('[SCORM CONTROLLER] Launch URL generated');

        res.json({
            success: true,
            launchUrl,
            message: 'Launch URL generated successfully'
        });

    } catch (error) {
        console.error('[SCORM CONTROLLER LAUNCH ERROR]', error.message);

        const statusCode = error.message.includes('not found') ? 404 :
            error.message.includes('permission') ? 403 : 400;

        res.status(statusCode).json({
            success: false,
            error: error.message
        });
    }
};

export const getManifest = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[SCORM CONTROLLER] Manifest request for package:', id);

        const manifest = await ScormService.getManifest(id);

        res.json({
            success: true,
            data: manifest
        });

    } catch (error) {
        console.error('[SCORM CONTROLLER MANIFEST ERROR]', error.message);
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
};

export const getPackage = async (req, res) => {
    try {
        const { id } = req.params;
        const packageData = await ScormService.getPackage(id);

        res.json({
            success: true,
            data: packageData
        });

    } catch (error) {
        console.error('[SCORM CONTROLLER GET ERROR]', error.message);
        res.status(404).json({
            success: false,
            error: error.message
        });
    }
};

export const getPackages = async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const packages = await ScormService.getPackages({
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            data: packages,
            meta: {
                count: packages.length,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('[SCORM CONTROLLER LIST ERROR]', error.message);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};

export const deletePackage = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('[SCORM CONTROLLER] Delete request for package:', id);

        await ScormService.deletePackage(id, req.user.id);

        res.json({
            success: true,
            message: 'SCORM package deleted successfully'
        });

    } catch (error) {
        console.error('[SCORM CONTROLLER DELETE ERROR]', error.message);

        const statusCode = error.message.includes('not found') ? 404 :
            error.message.includes('permission') ? 403 : 400;

        res.status(statusCode).json({
            success: false,
            error: error.message
        });
    }
};

export const testConnection = async (req, res) => {
    try {
        const result = await ScormService.testScormCloudConnection();

        res.json({
            success: result.success,
            message: result.message,
            details: result.error ? { error: result.error } : null
        });

    } catch (error) {
        console.error('[SCORM CONTROLLER TEST ERROR]', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Helper for file cleanup (if needed)
import fs from 'fs';