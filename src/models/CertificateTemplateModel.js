import { prisma } from '../utils/db.js';
import { put } from '@vercel/blob';
import fs from 'fs';

export class CertificateTemplateModel {
    static async uploadAndSave(filePath, filename, mimeType, description, uploadedBy) {
        console.log('[CERT TEMPLATE MODEL] Uploading', filename);
        const blobPath = `certificates/${Date.now()}-${filename}`;
        const blob = await put(blobPath, fs.createReadStream(filePath), {
            access: 'public',
            token: process.env.BLOB_READ_WRITE_TOKEN
        });

        const template = await prisma.certificateTemplate.create({
            data: {
                filename,
                blobUrl: blob.url,
                mimeType,
                description,
                createdBy: uploadedBy
            },
            include: { creator: true }
        });

        return { ...template, blob };
    }

    static async findMany() {
        return prisma.certificateTemplate.findMany({
            include: { creator: { select: { fullName: true } } },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async findById(id) {
        return prisma.certificateTemplate.findUnique({
            where: { id },
            include: { creator: true }
        });
    }

    static async findLatest() {
        return prisma.certificateTemplate.findFirst({
            orderBy: { createdAt: 'desc' },
            include: { creator: true }
        });
    }
}