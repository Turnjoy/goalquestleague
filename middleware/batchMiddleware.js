/**
 * "Usher & Bouncer" Batching Middleware
 * 
 * This middleware acts as an usher (queues incoming requests) and bouncer (throttles traffic)
 * to prevent server memory surges, connection timeouts, and Gemini API rate-limit crashes.
 * 
 * Features:
 * - Request queueing with controlled concurrency
 * - Rate limiting per endpoint
 * - Automatic batching for Gemini API calls
 * - Graceful degradation under load
 * - Request timeout management
 */

class RequestQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3; // Max concurrent requests
    this.queue = [];
    this.active = 0;
    this.requestDelay = options.requestDelay || 500; // Delay between requests in ms
    this.timeout = options.timeout || 120000; // Request timeout in ms
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalRejected: 0,
      totalTimeout: 0,
      currentQueueSize: 0
    };
  }

  async enqueue(requestFn) {
    this.stats.totalQueued++;
    this.stats.currentQueueSize = this.queue.length;

    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject, timestamp: Date.now() });
      this.process();
    });
  }

  async process() {
    if (this.active >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.active++;
    const { requestFn, resolve, reject, timestamp } = this.queue.shift();
    this.stats.currentQueueSize = this.queue.length;

    // Check if request has been waiting too long (queue timeout)
    if (Date.now() - timestamp > 60000) { // 1 minute queue timeout
      this.active--;
      this.stats.totalRejected++;
      this.stats.currentQueueSize = this.queue.length;
      reject(new Error('Request queued too long - try again'));
      this.process();
      return;
    }

    try {
      // Add delay between requests to prevent rate limiting
      if (this.queue.length > 0) {
        await this.delay(this.requestDelay);
      }

      // Execute with timeout
      const result = await this.withTimeout(requestFn(), this.timeout);
      this.stats.totalProcessed++;
      resolve(result);
    } catch (error) {
      if (error.message === 'Request timeout') {
        this.stats.totalTimeout++;
      }
      reject(error);
    } finally {
      this.active--;
      this.process();
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);
  }

  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      activeRequests: this.active
    };
  }

  clear() {
    this.queue = [];
    this.stats.currentQueueSize = 0;
  }
}

// Singleton queue instances for different endpoints
const queues = {
  squadExtraction: new RequestQueue({ maxConcurrent: 3, requestDelay: 1000, timeout: 300000 }),
  general: new RequestQueue({ maxConcurrent: 5, requestDelay: 100, timeout: 60000 })
};

/**
 * Batching middleware for Express
 * @param {string} queueName - Name of the queue to use ('squadExtraction' or 'general')
 */
export function batchingMiddleware(queueName = 'general') {
  const queue = queues[queueName] || queues.general;

  return async (req, res, next) => {
    try {
      // Log incoming request
      console.log(`[BATCHING] Request queued for ${req.path}. Queue size: ${queue.getStats().queueLength}`);

      // Process request through the queue
      const result = await queue.enqueue(async () => {
        // Execute the actual request handler
        return new Promise((resolve, reject) => {
          const originalJson = res.json;
          const originalSend = res.send;

          // Override res.json to capture the response
          res.json = (data) => {
            res.json = originalJson;
            resolve(data);
            return originalJson.call(res, data);
          };

          // Override res.send to capture responses
          res.send = (data) => {
            res.send = originalSend;
            resolve(data);
            return originalSend.call(res, data);
          };

          next();
        });
      });

      // Send the result if the handler already responded
      if (result !== undefined && !res.headersSent) {
        return res.json(result);
      }
    } catch (error) {
      console.error(`[BATCHING] Request failed:`, error.message);
      
      if (!res.headersSent) {
        if (error.message === 'Request queued too long - try again') {
          return res.status(429).json({
            error: 'Too many requests queued. Please try again in a moment.',
            code: 'QUEUE_FULL',
            retryAfter: 30
          });
        } else if (error.message === 'Request timeout') {
          return res.status(504).json({
            error: 'Request processing timed out. Please try again.',
            code: 'REQUEST_TIMEOUT'
          });
        } else {
          return res.status(500).json({
            error: 'Internal server error during batched processing.',
            code: 'BATCHING_ERROR'
          });
        }
      }
    }
  };
}

/**
 * Rate limiting middleware using in-memory storage
 * For production, consider using Redis or similar
 */
class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute window
    this.maxRequests = options.maxRequests || 10;
    this.requests = new Map();
  }

  isAllowed(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean up old entries
    for (const [id, timestamps] of this.requests) {
      this.requests.set(id, timestamps.filter(t => t > windowStart));
      if (this.requests.get(id).length === 0) {
        this.requests.delete(id);
      }
    }

    // Get or create request timestamps for this identifier
    const timestamps = this.requests.get(identifier) || [];
    timestamps.push(now);
    this.requests.set(identifier, timestamps);

    return timestamps.length <= this.maxRequests;
  }

  getRemainingTime(identifier) {
    const timestamps = this.requests.get(identifier) || [];
    if (timestamps.length === 0) return this.windowMs;
    
    const oldestTimestamp = timestamps[0];
    const windowStart = Date.now() - this.windowMs;
    return Math.max(0, this.windowMs - (Date.now() - oldestTimestamp));
  }
}

const rateLimiters = {
  squadExtraction: new RateLimiter({ windowMs: 60000, maxRequests: 3 }), // 3 requests per minute
  general: new RateLimiter({ windowMs: 60000, maxRequests: 30 }) // 30 requests per minute
};

/**
 * Rate limiting middleware
 * @param {string} limiterName - Name of the rate limiter to use
 * @param {Function} getIdentifier - Function to extract identifier from request (default: IP)
 */
export function rateLimitMiddleware(limiterName = 'general', getIdentifier = null) {
  const limiter = rateLimiters[limiterName] || rateLimiters.general;

  return (req, res, next) => {
    const identifier = getIdentifier ? getIdentifier(req) : req.ip || req.connection.remoteAddress;

    if (limiter.isAllowed(identifier)) {
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', limiter.maxRequests);
      res.setHeader('X-RateLimit-Remaining', limiter.maxRequests - (limiter.requests.get(identifier)?.length || 0));
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + limiter.windowMs).toISOString());
      
      next();
    } else {
      const retryAfter = Math.ceil(limiter.getRemainingTime(identifier) / 1000);
      
      res.setHeader('Retry-After', retryAfter.toString());
      res.setHeader('X-RateLimit-Limit', limiter.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + limiter.windowMs).toISOString());
      
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter
      });
    }
  };
}

/**
 * Get queue statistics endpoint
 */
export function getQueueStats(req, res) {
  const allStats = {};
  for (const [name, queue] of Object.entries(queues)) {
    allStats[name] = queue.getStats();
  }
  
  res.json({
    success: true,
    queues: allStats,
    timestamp: new Date().toISOString()
  });
}

/**
 * Clear queue endpoint (admin only)
 */
export function clearQueue(req, res) {
  const { queueName } = req.params;
  
  if (queueName && queues[queueName]) {
    queues[queueName].clear();
    res.json({
      success: true,
      message: `Queue ${queueName} cleared`,
      stats: queues[queueName].getStats()
    });
  } else {
    res.status(400).json({
      error: 'Invalid queue name',
      availableQueues: Object.keys(queues)
    });
  }
}

export { RequestQueue, rateLimiters };
