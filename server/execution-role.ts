// Cloud is a monitor and transfer source. Only the dedicated PC executes work.
// This rule survives a deployment that loses the old localMigration flag.
export const cloudMonitorMode = () => process.env.CENTRAL_LOCAL_MODE !== 'true';
export const diagnosticMode = () => process.env.CENTRAL_DIAGNOSTIC_MODE === 'true';

export const cloudOpenJarvisEnabled = () =>
  cloudMonitorMode() && !diagnosticMode() &&
  process.env.CENTRAL_CLOUD_OPENJARVIS === 'true' &&
  process.env.REQUIRE_ADMIN_AUTH === 'true' &&
  (process.env.OPENJARVIS_WORKER_KEY?.length ?? 0) >= 32;

export const openJarvisWorkerKey = () => cloudMonitorMode()
  ? (cloudOpenJarvisEnabled() ? process.env.OPENJARVIS_WORKER_KEY || '' : '')
  : process.env.CHANNEL_TEST_WORKER_KEY || '';
