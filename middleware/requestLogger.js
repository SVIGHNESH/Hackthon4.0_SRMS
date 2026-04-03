const crypto = require('crypto');

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie']);

const buildRequestId = () => crypto.randomBytes(6).toString('hex');

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '0b';
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
};

const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  const requestId = buildRequestId();
  req.requestId = requestId;

  const startedAt = new Date().toISOString();
  const method = req.method;
  const path = req.originalUrl || req.url;
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  const headers = Object.keys(req.headers || {}).filter(
    key => !SENSITIVE_HEADERS.has(key.toLowerCase())
  );

  console.log(`[REQ ${requestId}] ${method} ${path} from ${ip} at ${startedAt}`);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const lengthHeader = res.getHeader('content-length');
    const responseSize = typeof lengthHeader === 'string'
      ? parseInt(lengthHeader, 10)
      : Number.isFinite(lengthHeader)
        ? lengthHeader
        : 0;

    const userId = req.user?.id || req.user?._id || 'anonymous';
    const durationText = `${durationMs.toFixed(1)}ms`;
    const sizeText = formatBytes(responseSize);

    console.log(
      `[RES ${requestId}] ${status} ${method} ${path} in ${durationText} (${sizeText}) user=${userId} headers=${headers.length}`
    );
  });

  next();
};

module.exports = requestLogger;
