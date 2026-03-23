

import axios from 'axios';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export class ScormCloudService {
    static client = null;

    static init() {
        if (!this.client) {
            this.client = axios.create({
                baseURL: 'https://cloud.scorm.com/api/v2',
                auth: {
                    username: process.env.SCORM_CLOUD_APP_ID,
                    password: process.env.SCORM_CLOUD_SECRET_KEY,
                },
                headers: { Accept: 'application/json' },
                timeout: 300000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            });
        }
        return this.client;
    }

    static async uploadCourse(filePath, filename, lessonId = null) {
        try {
            console.log(`[UPLOAD] Starting: ${filename} (lesson: ${lessonId || 'none'})`);

            if (!fs.existsSync(filePath)) throw new Error(`File missing: ${filePath}`);
            const stats = fs.statSync(filePath);
            if (stats.size === 0) throw new Error('File empty');

            const fileBuffer = fs.readFileSync(filePath);
            const courseId = lessonId ? `lesson-${lessonId}` : `pkg-${uuidv4().replace(/-/g, '')}`;

            const FormData = (await import('form-data')).default;
            const form = new FormData();
            form.append('file', fileBuffer, { filename, contentType: 'application/zip' });
            form.append('mayCreateNewVersion', 'true');

            const client = this.init();
            const endpoint = `/courses/importJobs/upload?courseId=${encodeURIComponent(courseId)}`;

            console.log(`[UPLOAD] POST to: ${endpoint}`);
            const res = await client.post(endpoint, form, { headers: form.getHeaders() });

            console.log('[UPLOAD] Status:', res.status);
            console.log('[UPLOAD] Data:', JSON.stringify(res.data, null, 2));

            let jobId;
            if (res.data.id) {
                jobId = res.data.id;
            } else if (res.data.result) {
                if (res.data.result.includes(courseId)) {
                    jobId = res.data.result.replace(courseId, '');
                } else {
                    jobId = res.data.result.substring(0, 10);
                }
            }

            if (!jobId) throw new Error('No jobId extracted');

            console.log(`[UPLOAD] Job ID: ${jobId}`);

            return await this.waitForImportJob(jobId, courseId, filename);
        } catch (err) {
            console.error('[UPLOAD ERROR]', err.message, err.response?.data);
            throw err;
        }
    }

    static async waitForImportJob(jobId, courseId, filename, maxAttempts = 180, intervalMs = 10000) {
        console.log(`[POLL] Job ${jobId} → Course ${courseId} | ${maxAttempts} attempts (~30 min)`);

        const client = this.init();

        await new Promise(r => setTimeout(r, 15000)); // initial delay

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(r => setTimeout(r, intervalMs));

            try {
                const courseRes = await client.get(`/courses/${courseId}`);
                const course = courseRes.data;

                console.log(`[POLL ${attempt}] Course READY! Title: ${course.title}`);

                return {
                    scormCloudId: course.id || courseId,
                    title: course.title || filename.replace(/\.zip$/i, ''),
                    scormVersion: course.version || '2004 4th Edition'
                };
            } catch (err) {
                if (err.response?.status === 404) {
                    console.log(`[POLL ${attempt}] Course not ready yet`);
                    continue;
                }
                console.error(`[POLL ERROR ${attempt}]`, err.message, err.response?.data);
                throw err;
            }
        }

        throw new Error(`Timeout after ${maxAttempts} attempts. Check dashboard for course ${courseId}`);
    }
    static async createLaunchLink(courseId, learnerId, learnerName) {
        const client = this.init();

        const registrationId = `reg-${uuidv4().replace(/-/g, '')}`;
        console.log(`[LAUNCH] Generated registrationId: ${registrationId}`);

        const nameParts = (learnerName || 'Learner User').split(' ');
        const firstName = nameParts[0] || 'Learner';
        const lastName = nameParts.slice(1).join(' ') || 'User';

        const payload = {
            registrationId,
            courseId,
            learner: {
                id: learnerId.toString(),
                firstName: firstName.substring(0, 100),
                lastName: lastName.substring(0, 100)
            }
        };

        console.log('[LAUNCH] Creating registration:', JSON.stringify(payload, null, 2));

        await client.post('/registrations', payload);
        console.log('[LAUNCH] Registration created');

        // Confirm
        await new Promise(r => setTimeout(r, 2000));
        const confirm = await client.get(`/registrations/${registrationId}`);
        console.log('[LAUNCH] Registration confirmed');

        // Get launch link (correct endpoint)
        const launchPayload = {
            redirectOnExitUrl: "https://bicmas-trainee.vercel.app/scorm-exit.html",
            // launchAuth: {
            //     type: "vault",
            //     options: {
            //         ipAddress: true,        // bind to IP (recommended for security)
            //         fingerprint: false,     // usually off (privacy)
            //         expiry: 0,
            //         slidingExpiry: 0
            //     }
            // }
        };

        const launchRes = await client.post(
            `/registrations/${registrationId}/launchLink`,
            launchPayload
        );

        const launchUrl = launchRes.data.launchLink;

        if (!launchUrl) throw new Error('No launchLink');

        console.log('[LAUNCH] Success:', launchUrl);

        return { launchUrl, registrationId };
    }

    static async getRegistrationProgress(registrationId) {
        const client = this.init();
        const res = await client.get(`/registrations/${registrationId}/progress`);
        return res.data;
    }

    static async testConnection() {
        const client = this.init();
        try {
            await client.get('/courses?limit=1');
            return true;
        } catch (err) {
            return false;
        }
    }


    static async getRegistrationScore(registrationId) {
        const client = this.init();
        try {
            const res = await client.get(`/registrations/${registrationId}`);
            const data = res.data;

            return {
                raw: data.score?.raw || null,           // actual score (e.g. 85)
                scaled: data.score?.scaled || null,     // 0–1 scale (e.g. 0.85)
                min: data.score?.min || null,
                max: data.score?.max || null,
                completion: data.completion || null,
                success: data.success || null,
                totalSecondsTracked: data.totalSecondsTracked || null
            };
        } catch (err) {
            console.error('[SCORE FETCH ERROR]', err.response?.data || err.message);
            throw new Error(`Failed to fetch score for registration ${registrationId}`);
        }
    }
}