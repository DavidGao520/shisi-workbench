// CommonJS entry: SCF resolves index.js for the index.main_handler execution
// method; the implementation lives in ES modules loaded lazily on cold start.
let handler;
exports.main_handler = async (event, context) => {
  if (!handler) {
    const { createVoiceHandlerFromEnv } = await import('./handler.mjs');
    handler = createVoiceHandlerFromEnv();
  }
  return handler(event, context);
};
