const Redis = require("ioredis");

function createRedis(redisUrl) {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false
  });

  redis.on("error", () => {});
  return redis;
}

async function cacheGetJson(redis, key) {
  const v = await redis.get(key);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function cacheSetJson(redis, key, value, ttlSeconds) {
  const payload = JSON.stringify(value);
  await redis.set(key, payload, "EX", ttlSeconds);
}

module.exports = { createRedis, cacheGetJson, cacheSetJson };
