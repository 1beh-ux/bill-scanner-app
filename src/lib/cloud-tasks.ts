import { CloudTasksClient } from "@google-cloud/tasks";

const client = new CloudTasksClient();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.CLOUD_TASKS_LOCATION || "europe-west3";
const QUEUE = process.env.CLOUD_TASKS_QUEUE || "bill-ai-queue";
const APP_BASE_URL = process.env.APP_BASE_URL;
const TASKS_SECRET = process.env.TASKS_SECRET;

/**
 * Enqueues one Cloud Task per bill, targeting the internal worker route
 * (src/app/api/tasks/process-bill-ai/[id]). This replaces the old
 * fire-and-forget `void runBulkAiJob(...)` loop that used to run inside
 * the bulk-ai request handler itself.
 *
 * Why that had to go: on Cloud Run, work kicked off after a response has
 * already been sent is not guaranteed to keep running — the instance can
 * be recycled or scaled down once the request is considered "done", which
 * is exactly the kind of thing that silently drops a chunk of an
 * in-progress batch. A Cloud Tasks queue is durable independent of any
 * particular Cloud Run instance's lifecycle: each task survives instance
 * recycling, retries automatically with backoff on failure, and its
 * dispatch rate/concurrency is controlled at the queue level (see the
 * `gcloud tasks queues create` command in the setup notes) instead of a
 * hand-rolled `Promise.all` batch loop.
 *
 * One task per bill (rather than one task for the whole selection) is
 * also what removes the old 20-bill cap: each bill's extraction succeeds,
 * fails, and retries completely independently of every other bill in the
 * run, so there's no longer a single unit of work whose size needs to be
 * kept small enough to finish inside one request.
 */
export async function enqueueBillAiTasks(billIds: string[]): Promise<void> {
  if (!PROJECT_ID || !APP_BASE_URL || !TASKS_SECRET) {
    throw new Error(
      "Cloud Tasks is not configured — GOOGLE_CLOUD_PROJECT, APP_BASE_URL and TASKS_SECRET must all be set"
    );
  }

  const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE);

  await Promise.all(
    billIds.map((billId) =>
      client.createTask({
        parent,
        task: {
          httpRequest: {
            httpMethod: "POST",
            url: `${APP_BASE_URL}/api/tasks/process-bill-ai/${billId}`,
            headers: {
              "x-tasks-secret": TASKS_SECRET,
              "Content-Type": "application/json",
            },
          },
        },
      })
    )
  );
}
