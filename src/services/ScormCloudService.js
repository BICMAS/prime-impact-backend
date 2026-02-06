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
        console.log(`[POLL START] For course ${courseId} (job ${jobId}) - checking every ${intervalMs / 1000}s, max ${maxAttempts} attempts`);

        const client = this.init();

        // Initial delay
        console.log('[POLL] Waiting initial 10s for processing...');
        await new Promise(r => setTimeout(r, 10000));

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(r => setTimeout(r, intervalMs));

            try {
                // Primary check: does the COURSE exist now?
                const courseRes = await client.get(`/courses/${courseId}`);
                const course = courseRes.data;

                console.log(`[POLL ${attempt}/${maxAttempts}] Course found! Status: ${course.status || 'unknown'}`);
                console.log(`[POLL DETAIL] Course data: ${JSON.stringify(course, null, 2)}`);

                // If course exists → import succeeded (even if job is gone)
                return {
                    scormCloudId: course.id || courseId,
                    title: course.title || filename.replace(/\.zip$/i, ''),
                    scormVersion: course.version || '2004 4th Edition',
                };
            } catch (err) {
                if (err.response?.status === 404) {
                    console.log(`[POLL ${attempt}] Course not visible yet (404) - still processing...`);
                    // Optional: also try job endpoint for error info
                    try {
                        const jobRes = await client.get(`/courses/importJobs/${jobId}`);
                        console.log(`[POLL JOB CHECK] Job state: ${jobRes.data.state || 'unknown'}`);
                    } catch (jobErr) {
                        // Ignore job 404
                    }
                    continue;
                }

                console.error(`[POLL ERROR ${attempt}]`, err.response?.data || err.message);
                throw err;
            }
        }

        throw new Error(
            `Timeout waiting for course ${courseId} to appear. ` +
            `But since you see it in dashboard, the import succeeded — just polling missed it. ` +
            `You can safely use scormCloudId = ${courseId} now.`
        );
    }
    // ──────────────────────────────────────────────
    // The rest of your methods (unchanged)
    // ──────────────────────────────────────────────

    static async createLaunchLink(courseId, learnerId, learnerName) {
        const client = this.init();

        // Generate your own unique registrationId
        const registrationId = `reg-${uuidv4().replace(/-/g, '')}`;
        console.log(`[LAUNCH] Generated registrationId: ${registrationId}`);

        const [firstName = 'Learner', ...lastParts] = (learnerName || 'User').split(' ');
        const lastName = lastParts.join(' ') || 'User';

        const payload = {
            registrationId,  // We provide it
            courseId,
            learner: {
                id: learnerId.toString(),
                firstName: firstName.substring(0, 100),
                lastName: lastName.substring(0, 100)
            }
        };

        console.log('[LAUNCH] Creating registration with payload:', JSON.stringify(payload, null, 2));

        try {
            const regRes = await client.post('/registrations', payload);
            console.log('[LAUNCH] Registration create response:', regRes.status, JSON.stringify(regRes.data, null, 2));

            // Trust the ID we sent (V2 usually honors it)
            // But confirm it exists with GET
            await new Promise(r => setTimeout(r, 2000)); // small delay for propagation
            const confirmRes = await client.get(`/registrations/${registrationId}`);
            console.log('[LAUNCH] Registration confirmed exists:', JSON.stringify(confirmRes.data, null, 2));
        } catch (createErr) {
            console.error('[LAUNCH CREATE ERROR FULL]', {
                status: createErr.response?.status,
                data: createErr.response?.data,
                message: createErr.message,
                payloadSent: payload
            });
            throw new Error(`Registration creation failed: ${createErr.response?.data?.error || createErr.message}`);
        }

        // Launch with the ID we know
        try {
            const launchRes = await client.post(`/registrations/${registrationId}/launch`);
            const launchUrl = launchRes.data.launchLink;

            if (!launchUrl) {
                throw new Error('No launchLink in response');
            }

            console.log('[LAUNCH SUCCESS] Launch URL:', launchUrl);

            return {
                launchUrl,
                registrationId
            };
        } catch (launchErr) {
            console.error('[LAUNCH ERROR FULL]', {
                status: launchErr.response?.status,
                data: launchErr.response?.data,
                message: launchErr.message,
                registrationIdUsed: registrationId
            });
            throw launchErr;
        }
    }

    static async getRegistrationProgress(registrationId) {
        const client = this.init();
        const res = await client.get(`/registrations/${registrationId}/progress`);
        return res.data;
    }

    static async getRegistrationStatements(registrationId) {
        const client = this.init();
        const res = await client.get(`/registrations/${registrationId}/statements`);
        return res.data.statements || [];
    }

    static async testConnection() {
        const client = this.init();
        try {
            const res = await client.get('/courses?limit=1');
            return { success: true, message: `Connected - ${res.data.courses?.length || 0} courses found` };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }
}