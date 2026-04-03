const rateLimitStore = new Map();

const cleanExpiredEntries = () => {
    const now = Date.now();
    for (const [ip, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > 60000) {
            rateLimitStore.delete(ip);
        }
    }
};

setInterval(cleanExpiredEntries, 60000);

const rateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    let clientData = rateLimitStore.get(ip);
    
    if (!clientData || now - clientData.windowStart > 60000) {
        clientData = { windowStart: now, count: 1 };
        rateLimitStore.set(ip, clientData);
        return next();
    }
    
    if (clientData.count >= 200) {
        return res.status(429).json({ 
            success: false, 
            message: "Too many requests. Please try again later." 
        });
    }
    
    clientData.count++;
    rateLimitStore.set(ip, clientData);
    next();
};

module.exports = rateLimiter;
