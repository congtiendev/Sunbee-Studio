try {
  process.loadEnvFile();
} catch {
  // no .env file present (e.g. packaged build where Electron sets env vars directly)
}
