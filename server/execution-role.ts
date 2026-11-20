// The published preview keeps its existing protections until a restored cloud service is enabled.
export const cloudOperationsEnabled = () =>
  process.env.CENTRAL_LOCAL_MODE !== 'true' && process.env.CENTRAL_CLOUD_OPERATIONS === 'true';

export const cloudMonitorMode = () => process.env.CENTRAL_LOCAL_MODE !== 'true' && !cloudOperationsEnabled();
export const diagnosticMode = () => process.env.CENTRAL_DIAGNOSTIC_MODE === 'true';
export const outboundEnabled = () => !diagnosticMode() && !cloudMonitorMode() &&
  (!cloudOperationsEnabled() || process.env.CENTRAL_CLOUD_SENDS === 'true');

export const cloudOpenJarvisEnabled = () =>
  process.env.CENTRAL_LOCAL_MODE !== 'true' && !diagnosticMode() &&
  process.env.CENTRAL_CLOUD_OPENJARVIS === 'true' &&
  process.env.REQUIRE_ADMIN_AUTH === 'true' &&
  (process.env.OPENJARVIS_WORKER_KEY?.length ?? 0) >= 32;

export const openJarvisWorkerKey = () => process.env.CENTRAL_LOCAL_MODE === 'true'
  ? process.env.CHANNEL_TEST_WORKER_KEY || ''
  : (cloudOpenJarvisEnabled() ? process.env.OPENJARVIS_WORKER_KEY || '' : '');
