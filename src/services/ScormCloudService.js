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

    /**
     * Upload SCORM zip to SCORM Cloud using query param for courseId
     */
    static async uploadCourse(filePath, filename, lessonId = null) {
        try {
            console.log(`[SCORM] Uploading ${filename} ...`);

            const fileBuffer = fs.readFileSync(filePath);
            const courseId = lessonId
                ? `lesson-${lessonId}`
                : `pkg-${uuidv4().replace(/-/g, '')}`;

            const FormData = (await import('form-data')).default;
            const form = new FormData();
            form.append('file', fileBuffer, { filename, contentType: 'application/zip' });
            form.append('mayCreateNewVersion', 'true');

            const client = this.init();

            const endpoint = `/courses/importJobs/upload?courseId=${encodeURIComponent(courseId)}`;
            const res = await client.post(endpoint, form, {
                headers: form.getHeaders(),
            });

            console.log('[SCORM CLOUD] Upload job response:', res.status, JSON.stringify(res.data, null, 2));

            let jobId;
            if (res.data.id) {
                jobId = res.data.id;
            } else if (res.data.result) {
                // Handle concatenated jobId + courseId
                if (res.data.result.includes(courseId)) {
                    jobId = res.data.result.replace(courseId, '');
                } else {
                    // Common pattern: first 10 chars are jobId
                    jobId = res.data.result.substring(0, 10);
                }
            }

            if (!jobId) {
                throw new Error('Could not extract job ID from response');
            }

            console.log('[SCORM CLOUD] Extracted jobId:', jobId);

            // Diagnostic: check if course already exists
            try {
                const courseCheck = await client.get(`/courses/${courseId}`);
                console.log('[DIAGNOSTIC] Course check after upload:', JSON.stringify(courseCheck.data, null, 2));
            } catch (checkErr) {
                console.log('[DIAGNOSTIC] Course not found yet:', checkErr.response?.status || checkErr.message);
            }

            return await this.waitForImportJob(jobId, courseId, filename);
        } catch (err) {
            console.error('[SCORM CLOUD UPLOAD ERROR]', {
                message: err.message,
                response: err.response?.data,
                status: err.response?.status,
            });
            throw new Error(`Upload failed: ${err.message}`);
        }
    }

    /**
     * Poll import job with extended timeout, initial delay, and diagnostics
     */
    /**
 * Poll for import completion by checking the COURSE instead of the job
 * (more reliable since jobs disappear quickly after completion)
 */
    static async waitForImportJob(jobId, courseId, filename, maxAttempts = 120, intervalMs = 8000) {
        console.log(`[POLL START] For course ${courseId} (job ${jobId})`);

        const client = this.init();

        console.log('[POLL] Waiting initial 10s...');
        await new Promise(r => setTimeout(r, 10000));

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(r => setTimeout(r, intervalMs));

            try {
                const courseRes = await client.get(`/courses/${courseId}`);
                const course = courseRes.data;

                console.log(`[POLL ${attempt}] Course found! Title: ${course.title}`);

                return {
                    scormCloudId: course.id || courseId,
                    title: course.title || filename.replace(/\.zip$/i, ''),
                    scormVersion: course.version || '2004 4th Edition',
                };
            } catch (err) {
                if (err.response?.status === 404) {
                    console.log(`[POLL ${attempt}] Course not visible yet`);
                    continue;
                }
                throw err;
            }
        }

        throw new Error(`Timeout waiting for course ${courseId}. Check dashboard.`);
    }

    /**
     * Create registration and get launch link (correct /launchLink endpoint)
     */
    static async createLaunchLink(courseId, learnerId, learnerName) {
        const client = this.init();

        const registrationId = `reg-${uuidv4().replace(/-/g, '')}`;
        console.log(`[LAUNCH] Generated registrationId: ${registrationId}`);

        const nameParts = (learnerName || 'Learner User').split(' ');
        const firstName = nameParts[0] || 'Learner';
        const lastName = nameParts.slice(1).join(' ') || 'User';

        const regPayload = {
            registrationId,
            courseId,
            learner: {
                id: learnerId.toString(),
                firstName: firstName.substring(0, 100),
                lastName: lastName.substring(0, 100)
            }
        };

        console.log('[LAUNCH] Creating registration:', JSON.stringify(regPayload, null, 2));

        try {
            await client.post('/registrations', regPayload);
            console.log('[LAUNCH] Registration created');

            // Confirm
            await new Promise(r => setTimeout(r, 2000));
            const confirm = await client.get(`/registrations/${registrationId}`);
            console.log('[LAUNCH] Registration confirmed');
        } catch (err) {
            console.error('[REGISTRATION ERROR]', err.response?.data || err.message);
            throw err;
        }

        // Launch with correct endpoint + required payload
        const launchPayload = {
            redirectOnExitUrl: 'https://your-lms-domain.com/lesson-complete' // ← CHANGE THIS
            // or use: 'message' or 'close'
        };

        console.log('[LAUNCH] Requesting launch link:', JSON.stringify(launchPayload, null, 2));

        try {
            const launchRes = await client.post(
                `/registrations/${registrationId}/launchLink`,
                launchPayload
            );

            const launchUrl = launchRes.data.launchLink;

            if (!launchUrl) {
                throw new Error('No launchLink in response');
            }

            console.log('[LAUNCH] Success:', launchUrl);

            return { launchUrl, registrationId };
        } catch (err) {
            console.error('[LAUNCH ERROR]', {
                status: err.response?.status,
                data: err.response?.data,
                message: err.message,
                regId: registrationId,
                payload: launchPayload
            });
            throw err;
        }
    }

    static async getRegistrationProgress(registrationId) {
        const client = this.init();
        const res = await client.get(`/registrations/${registrationId}/progress`);
        return res.data;
    }

    static async testConnection() {
        const client = this.init();
        try {
            const res = await client.get('/courses?limit=1');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}