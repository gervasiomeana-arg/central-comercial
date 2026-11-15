// Cloud is a monitor and transfer source. Only the dedicated PC executes work.
// This rule survives a deployment that loses the old localMigration flag.
export const cloudMonitorMode = () => process.env.CENTRAL_LOCAL_MODE !== 'true';
export const diagnosticMode = () => process.env.CENTRAL_DIAGNOSTIC_MODE === 'true';
